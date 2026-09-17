'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { getErrorMessage } from '@/src/lib/get-error-message'
import {
  executeOrQueueMutation,
  getCachedCollection,
  getOutboxMutations,
  isBrowserOnline,
  OUTBOX_CHANGED_EVENT,
  OUTBOX_STATUS_EVENT,
  OUTBOX_SYNCED_EVENT,
  saveCachedCollection,
  synchronizeOutbox,
} from '@/src/modules/offline'

import type { ChatLiveSession } from '../gateways/chat.gateway'
import {
  getLatestIncomingSequence,
  mergeChatMessages,
} from '../model/chat-messages'
import {
  applyChatReceiptEvent,
  EMPTY_CHAT_RECEIPT,
  mergeChatReceipt,
  resolveChatMessageDeliveryStatus,
} from '../model/chat-receipts'
import { createSupabaseChatGateway } from '../services/supabase-chat.gateway'
import type {
  ChatMessage,
  ChatReceiptState,
  ChatTypingEvent,
} from '../types/chat.types'

const PAGE_SIZE = 50
const CACHE_LIMIT = 100
const TYPING_HEARTBEAT_MS = 1_500
const LOCAL_TYPING_IDLE_MS = 2_200
const REMOTE_TYPING_TIMEOUT_MS = 3_500

export function useChat(
  userId: string,
  conversationId: string | null,
  active: boolean,
  onInboxChanged: () => void,
) {
  const gateway = useMemo(() => createSupabaseChatGateway(), [])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingOlder, setIsLoadingOlder] = useState(false)
  const [hasOlder, setHasOlder] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [outboxState, setOutboxState] = useState(
    new Map<string, { failed: boolean }>(),
  )
  const [hasHydratedCache, setHasHydratedCache] = useState(false)
  const [peerReceipt, setPeerReceipt] =
    useState<ChatReceiptState>(EMPTY_CHAT_RECEIPT)
  const [isPeerTyping, setIsPeerTyping] = useState(false)
  const liveSessionRef = useRef<ChatLiveSession | null>(null)
  const lastDeliveredSequenceRef = useRef<number | null>(null)
  const localTypingActiveRef = useRef(false)
  const lastTypingBroadcastAtRef = useRef(0)
  const localTypingIdleTimerRef = useRef<number | null>(null)
  const remoteTypingClientsRef = useRef(new Map<string, number>())

  const refreshPeerReceipt = useCallback(async () => {
    if (!conversationId || !isBrowserOnline()) return
    try {
      const receipt = await gateway.getPeerReceipt(conversationId)
      setPeerReceipt((current) => mergeChatReceipt(current, receipt))
    } catch (nextError) {
      setError(getErrorMessage(nextError))
    }
  }, [conversationId, gateway])

  const acknowledgeDelivery = useCallback(
    async (sequence: number): Promise<void> => {
      if (
        !isBrowserOnline() ||
        (lastDeliveredSequenceRef.current !== null &&
          sequence <= lastDeliveredSequenceRef.current)
      ) {
        return
      }

      try {
        const deliveredSequence = await gateway.markDeliveredThrough(sequence)
        lastDeliveredSequenceRef.current = Math.max(
          lastDeliveredSequenceRef.current ?? 0,
          deliveredSequence,
        )
      } catch (nextError) {
        setError(getErrorMessage(nextError))
      }
    },
    [gateway],
  )

  const handlePeerTyping = useCallback(
    (event: ChatTypingEvent) => {
      if (event.user_id === userId) return
      const existingTimer = remoteTypingClientsRef.current.get(event.client_id)
      if (existingTimer !== undefined) {
        window.clearTimeout(existingTimer)
        remoteTypingClientsRef.current.delete(event.client_id)
      }

      if (event.is_typing) {
        const timer = window.setTimeout(() => {
          remoteTypingClientsRef.current.delete(event.client_id)
          setIsPeerTyping(remoteTypingClientsRef.current.size > 0)
        }, REMOTE_TYPING_TIMEOUT_MS)
        remoteTypingClientsRef.current.set(event.client_id, timer)
      }
      setIsPeerTyping(remoteTypingClientsRef.current.size > 0)
    },
    [userId],
  )

  const refreshOutbox = useCallback(async () => {
    if (!conversationId) {
      setOutboxState(new Map())
      return
    }

    try {
      const mutations = await getOutboxMutations(userId)
      setOutboxState(
        new Map(
          mutations
            .filter(
              ({ table, payload }) =>
                table === 'chat_messages' &&
                payload?.conversation_id === conversationId,
            )
            .map((mutation) => [
              mutation.recordId,
              { failed: mutation.lastError !== null },
            ]),
        ),
      )
    } catch (nextError) {
      setError(getErrorMessage(nextError))
    }
  }, [conversationId, userId])

  const refreshLatest = useCallback(async () => {
    if (!conversationId || !isBrowserOnline()) return
    setIsLoading(true)
    try {
      const latest = await gateway.getLatestMessages(conversationId, PAGE_SIZE)
      setMessages((current) => mergeChatMessages(current, latest))
      const latestIncomingSequence = getLatestIncomingSequence(latest, userId)
      if (latestIncomingSequence !== null) {
        void acknowledgeDelivery(latestIncomingSequence)
      }
      setHasOlder(latest.length === PAGE_SIZE)
      setError(null)
    } catch (nextError) {
      setError(getErrorMessage(nextError))
    } finally {
      setIsLoading(false)
    }
  }, [acknowledgeDelivery, conversationId, gateway, userId])

  useEffect(() => {
    lastDeliveredSequenceRef.current = null
    localTypingActiveRef.current = false
    lastTypingBroadcastAtRef.current = 0
    if (localTypingIdleTimerRef.current !== null) {
      window.clearTimeout(localTypingIdleTimerRef.current)
      localTypingIdleTimerRef.current = null
    }
    if (!conversationId) return

    let mounted = true
    const remoteTypingClients = remoteTypingClientsRef.current
    const cacheName = `chat-messages:${conversationId}` as const

    const initialRefresh = window.requestAnimationFrame(() => {
      setMessages((current) =>
        current.filter(
          (message) => message.conversation_id === conversationId,
        ),
      )
      setPeerReceipt(EMPTY_CHAT_RECEIPT)
      setHasOlder(true)
      setHasHydratedCache(false)
      setIsPeerTyping(false)
      void getCachedCollection<ChatMessage>(userId, cacheName)
        .then((cached) => {
          if (mounted && cached) setMessages(cached)
        })
        .catch((nextError) => {
          if (mounted) setError(getErrorMessage(nextError))
        })
        .finally(() => {
          if (mounted) setHasHydratedCache(true)
        })
      void refreshOutbox()
      void refreshPeerReceipt()
    })

    const liveSession = gateway.subscribe(userId, conversationId, {
      onConnected: () => void refreshPeerReceipt(),
      onMessage: (message) => {
        setMessages((current) => mergeChatMessages(current, [message]))
        if (message.sender_id !== userId) {
          void acknowledgeDelivery(message.sequence)
        }
      },
      onReadState: (state) => {
        if (state.user_id === userId) onInboxChanged()
      },
      onReceipt: (receipt) => {
        if (receipt.user_id !== userId) {
          setPeerReceipt((current) => applyChatReceiptEvent(current, receipt))
        }
      },
      onTyping: handlePeerTyping,
    })
    liveSessionRef.current = liveSession

    const handleOutbox = () => void refreshOutbox()
    const handleSynced = () => {
      void refreshOutbox()
      void refreshLatest()
      onInboxChanged()
    }
    window.addEventListener(OUTBOX_CHANGED_EVENT, handleOutbox)
    window.addEventListener(OUTBOX_STATUS_EVENT, handleOutbox)
    window.addEventListener(OUTBOX_SYNCED_EVENT, handleSynced)

    return () => {
      mounted = false
      window.cancelAnimationFrame(initialRefresh)
      liveSessionRef.current = null
      if (localTypingActiveRef.current) {
        void liveSession.setTyping(false)
      }
      localTypingActiveRef.current = false
      lastTypingBroadcastAtRef.current = 0
      liveSession.unsubscribe()
      if (localTypingIdleTimerRef.current !== null) {
        window.clearTimeout(localTypingIdleTimerRef.current)
      }
      for (const timer of remoteTypingClients.values()) {
        window.clearTimeout(timer)
      }
      remoteTypingClients.clear()
      window.removeEventListener(OUTBOX_CHANGED_EVENT, handleOutbox)
      window.removeEventListener(OUTBOX_STATUS_EVENT, handleOutbox)
      window.removeEventListener(OUTBOX_SYNCED_EVENT, handleSynced)
    }
  }, [
    acknowledgeDelivery,
    conversationId,
    gateway,
    handlePeerTyping,
    onInboxChanged,
    refreshLatest,
    refreshOutbox,
    refreshPeerReceipt,
    userId,
  ])

  useEffect(() => {
    if (!active || !conversationId) return
    const refreshFrame = window.requestAnimationFrame(() => void refreshLatest())
    return () => window.cancelAnimationFrame(refreshFrame)
  }, [active, conversationId, refreshLatest])

  useEffect(() => {
    const handleFocus = () => {
      void refreshPeerReceipt()
      if (active) void refreshLatest()
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [active, refreshLatest, refreshPeerReceipt])

  useEffect(() => {
    if (!hasHydratedCache || !conversationId) return
    void saveCachedCollection(
      userId,
      `chat-messages:${conversationId}`,
      messages
        .filter((message) => message.conversation_id === conversationId)
        .slice(-CACHE_LIMIT),
    )
  }, [conversationId, hasHydratedCache, messages, userId])

  const viewMessages = useMemo(
    () =>
      messages
        .filter((message) => message.conversation_id === conversationId)
        .map((message): ChatMessage => {
          const pending = outboxState.get(message.id)
          if (pending) {
            return {
              ...message,
              delivery_status: pending.failed ? 'failed' : 'queued',
            }
          }
          if (
            message.sequence === null &&
            message.delivery_status !== 'failed'
          ) {
            return { ...message, delivery_status: 'sending' }
          }
          return {
            ...message,
            delivery_status: resolveChatMessageDeliveryStatus(
              message,
              userId,
              peerReceipt,
            ),
          }
        }),
    [conversationId, messages, outboxState, peerReceipt, userId],
  )

  const setTyping = useCallback((isTyping: boolean): void => {
    if (localTypingIdleTimerRef.current !== null) {
      window.clearTimeout(localTypingIdleTimerRef.current)
      localTypingIdleTimerRef.current = null
    }

    if (!isTyping) {
      if (localTypingActiveRef.current) {
        localTypingActiveRef.current = false
        lastTypingBroadcastAtRef.current = 0
        void liveSessionRef.current?.setTyping(false)
      }
      return
    }

    const now = Date.now()
    if (
      !localTypingActiveRef.current ||
      now - lastTypingBroadcastAtRef.current >= TYPING_HEARTBEAT_MS
    ) {
      localTypingActiveRef.current = true
      lastTypingBroadcastAtRef.current = now
      void liveSessionRef.current?.setTyping(true)
    }

    localTypingIdleTimerRef.current = window.setTimeout(() => {
      localTypingActiveRef.current = false
      lastTypingBroadcastAtRef.current = 0
      localTypingIdleTimerRef.current = null
      void liveSessionRef.current?.setTyping(false)
    }, LOCAL_TYPING_IDLE_MS)
  }, [])

  useEffect(() => {
    if (!active) setTyping(false)
  }, [active, setTyping])

  const sendMessage = useCallback(
    async (body: string): Promise<boolean> => {
      if (!conversationId) return false
      const trimmed = body.trim()
      if (!trimmed || trimmed.length > 2000) return false

      const id = crypto.randomUUID()
      const optimistic: ChatMessage = {
        id,
        sequence: null,
        conversation_id: conversationId,
        sender_id: userId,
        body: trimmed,
        created_at: new Date().toISOString(),
        delivery_status: 'sending',
      }
      setMessages((current) => mergeChatMessages(current, [optimistic]))

      try {
        const input = { id, conversation_id: conversationId, body: trimmed }
        const result = await executeOrQueueMutation(
          {
            userId,
            table: 'chat_messages',
            operation: 'upsert',
            recordId: id,
            payload: input,
          },
          () => gateway.createMessage(input),
        )

        if (result.status === 'synced') {
          setMessages((current) => mergeChatMessages(current, [result.data]))
        } else {
          setMessages((current) =>
            current.map((message) =>
              message.id === id
                ? { ...message, delivery_status: 'queued' }
                : message,
            ),
          )
        }
        onInboxChanged()
        setError(null)
        return true
      } catch (nextError) {
        setMessages((current) =>
          current.map((message) =>
            message.id === id
              ? { ...message, delivery_status: 'failed' }
              : message,
          ),
        )
        setError(getErrorMessage(nextError))
        return false
      }
    },
    [conversationId, gateway, onInboxChanged, userId],
  )

  const retryMessage = useCallback(
    async (id: string): Promise<void> => {
      if (!conversationId) return
      if (outboxState.has(id)) {
        setOutboxState((current) => {
          const next = new Map(current)
          next.set(id, { failed: false })
          return next
        })
        await synchronizeOutbox(userId)
        await refreshOutbox()
        return
      }

      const message = messages.find(
        (candidate) =>
          candidate.id === id &&
          candidate.conversation_id === conversationId,
      )
      if (!message) return
      setMessages((current) =>
        current.map((candidate) =>
          candidate.id === id
            ? { ...candidate, delivery_status: 'sending' }
            : candidate,
        ),
      )

      try {
        const input = {
          id,
          conversation_id: conversationId,
          body: message.body,
        }
        const result = await executeOrQueueMutation(
          {
            userId,
            table: 'chat_messages',
            operation: 'upsert',
            recordId: id,
            payload: input,
          },
          () => gateway.createMessage(input),
        )
        if (result.status === 'synced') {
          setMessages((current) => mergeChatMessages(current, [result.data]))
        }
      } catch (nextError) {
        setMessages((current) =>
          current.map((candidate) =>
            candidate.id === id
              ? { ...candidate, delivery_status: 'failed' }
              : candidate,
          ),
        )
        setError(getErrorMessage(nextError))
      }
    },
    [conversationId, gateway, messages, outboxState, refreshOutbox, userId],
  )

  const loadOlder = useCallback(async () => {
    if (!conversationId) return
    const firstSequence = messages.find(
      (message) =>
        message.conversation_id === conversationId && message.sequence !== null,
    )?.sequence
    if (firstSequence === null || firstSequence === undefined || isLoadingOlder) {
      return
    }

    setIsLoadingOlder(true)
    try {
      const older = await gateway.getMessagesBefore(
        conversationId,
        firstSequence,
        PAGE_SIZE,
      )
      setMessages((current) => mergeChatMessages(current, older))
      setHasOlder(older.length === PAGE_SIZE)
    } catch (nextError) {
      setError(getErrorMessage(nextError))
    } finally {
      setIsLoadingOlder(false)
    }
  }, [conversationId, gateway, isLoadingOlder, messages])

  const markReadThrough = useCallback(
    async (sequence: number): Promise<void> => {
      if (document.visibilityState !== 'visible') return
      try {
        await gateway.markReadThrough(sequence)
        lastDeliveredSequenceRef.current = Math.max(
          lastDeliveredSequenceRef.current ?? 0,
          sequence,
        )
        onInboxChanged()
      } catch (nextError) {
        setError(getErrorMessage(nextError))
      }
    },
    [gateway, onInboxChanged],
  )

  return {
    messages: viewMessages,
    isLoading,
    isLoadingOlder,
    hasOlder,
    error,
    isPeerTyping,
    sendMessage,
    retryMessage,
    loadOlder,
    markReadThrough,
    setTyping,
  }
}
