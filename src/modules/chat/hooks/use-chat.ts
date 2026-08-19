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
import { reduceChatUnreadCount } from '../model/chat-unread'
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

export function useChat(userId: string, active: boolean) {
  const gateway = useMemo(() => createSupabaseChatGateway(), [])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
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

  const refreshUnread = useCallback(async () => {
    if (!isBrowserOnline()) return
    try {
      const count = await gateway.getUnreadCount()
      setUnreadCount((current) =>
        reduceChatUnreadCount(current, { type: 'replace', count }),
      )
    } catch (nextError) {
      setError(getErrorMessage(nextError))
    }
  }, [gateway])

  const refreshPeerReceipt = useCallback(async () => {
    if (!isBrowserOnline()) return
    try {
      const receipt = await gateway.getPeerReceipt()
      setPeerReceipt((current) => mergeChatReceipt(current, receipt))
    } catch (nextError) {
      setError(getErrorMessage(nextError))
    }
  }, [gateway])

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
        await liveSessionRef.current?.publishReceipt({
          kind: 'delivered',
          sequence: deliveredSequence,
        })
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
    try {
      const mutations = await getOutboxMutations(userId)
      setOutboxState(
        new Map(
          mutations
            .filter(({ table }) => table === 'chat_messages')
            .map((mutation) => [
              mutation.recordId,
              { failed: mutation.lastError !== null },
            ]),
        ),
      )
    } catch (nextError) {
      setError(getErrorMessage(nextError))
    }
  }, [userId])

  const refreshLatest = useCallback(async () => {
    if (!isBrowserOnline()) return
    setIsLoading(true)
    try {
      const latest = await gateway.getLatestMessages(PAGE_SIZE)
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
  }, [acknowledgeDelivery, gateway, userId])

  useEffect(() => {
    let mounted = true
    const remoteTypingClients = remoteTypingClientsRef.current
    void getCachedCollection<ChatMessage>(userId, 'chat-messages')
      .then((cached) => {
        if (mounted && cached) setMessages(cached)
      })
      .catch((nextError) => {
        if (mounted) setError(getErrorMessage(nextError))
      })
      .finally(() => {
        if (mounted) setHasHydratedCache(true)
      })

    const initialRefresh = window.requestAnimationFrame(() => {
      void refreshOutbox()
      void refreshUnread()
      void refreshPeerReceipt()
    })

    const liveSession = gateway.subscribe(userId, {
      onConnected: () => void refreshPeerReceipt(),
      onMessage: (message) => {
        setMessages((current) => mergeChatMessages(current, [message]))
        if (message.sender_id !== userId) {
          setUnreadCount((current) =>
            reduceChatUnreadCount(current, { type: 'incoming' }),
          )
          void acknowledgeDelivery(message.sequence)
          void refreshUnread()
        }
      },
      onReadState: () => void refreshUnread(),
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
    }
    window.addEventListener(OUTBOX_CHANGED_EVENT, handleOutbox)
    window.addEventListener(OUTBOX_STATUS_EVENT, handleOutbox)
    window.addEventListener(OUTBOX_SYNCED_EVENT, handleSynced)

    return () => {
      mounted = false
      window.cancelAnimationFrame(initialRefresh)
      liveSessionRef.current = null
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
    gateway,
    handlePeerTyping,
    refreshLatest,
    refreshOutbox,
    refreshPeerReceipt,
    refreshUnread,
    userId,
  ])

  useEffect(() => {
    if (!active) return
    const refreshFrame = window.requestAnimationFrame(() => void refreshLatest())
    return () => window.cancelAnimationFrame(refreshFrame)
  }, [active, refreshLatest])

  useEffect(() => {
    const handleFocus = () => {
      void refreshUnread()
      void refreshPeerReceipt()
      if (active) void refreshLatest()
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [active, refreshLatest, refreshPeerReceipt, refreshUnread])

  useEffect(() => {
    if (!hasHydratedCache) return
    void saveCachedCollection(
      userId,
      'chat-messages',
      messages.slice(-CACHE_LIMIT),
    )
  }, [hasHydratedCache, messages, userId])

  const viewMessages = useMemo(
    () =>
      messages.map((message): ChatMessage => {
        const pending = outboxState.get(message.id)
        if (pending) {
          return {
            ...message,
            delivery_status: pending.failed ? 'failed' : 'queued',
          }
        }
        if (message.sequence === null && message.delivery_status !== 'failed') {
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
    [messages, outboxState, peerReceipt, userId],
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
      const trimmed = body.trim()
      if (!trimmed || trimmed.length > 2000) return false

      const id = crypto.randomUUID()
      const optimistic: ChatMessage = {
        id,
        sequence: null,
        sender_id: userId,
        body: trimmed,
        created_at: new Date().toISOString(),
        delivery_status: 'sending',
      }
      setMessages((current) => mergeChatMessages(current, [optimistic]))

      try {
        const result = await executeOrQueueMutation(
          {
            userId,
            table: 'chat_messages',
            operation: 'upsert',
            recordId: id,
            payload: { id, body: trimmed },
          },
          () => gateway.createMessage({ id, body: trimmed }),
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
    [gateway, userId],
  )

  const retryMessage = useCallback(
    async (id: string): Promise<void> => {
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

      const message = messages.find((candidate) => candidate.id === id)
      if (!message) return
      setMessages((current) =>
        current.map((candidate) =>
          candidate.id === id
            ? { ...candidate, delivery_status: 'sending' }
            : candidate,
        ),
      )

      try {
        const result = await executeOrQueueMutation(
          {
            userId,
            table: 'chat_messages',
            operation: 'upsert',
            recordId: id,
            payload: { id, body: message.body },
          },
          () => gateway.createMessage({ id, body: message.body }),
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
    [gateway, messages, outboxState, refreshOutbox, userId],
  )

  const loadOlder = useCallback(async () => {
    const firstSequence = messages.find(
      (message) => message.sequence !== null,
    )?.sequence
    if (firstSequence === null || firstSequence === undefined || isLoadingOlder) {
      return
    }

    setIsLoadingOlder(true)
    try {
      const older = await gateway.getMessagesBefore(firstSequence, PAGE_SIZE)
      setMessages((current) => mergeChatMessages(current, older))
      setHasOlder(older.length === PAGE_SIZE)
    } catch (nextError) {
      setError(getErrorMessage(nextError))
    } finally {
      setIsLoadingOlder(false)
    }
  }, [gateway, isLoadingOlder, messages])

  const markReadThrough = useCallback(
    async (sequence: number): Promise<void> => {
      if (document.visibilityState !== 'visible') return
      try {
        const remaining = await gateway.markReadThrough(sequence)
        lastDeliveredSequenceRef.current = Math.max(
          lastDeliveredSequenceRef.current ?? 0,
          sequence,
        )
        setUnreadCount((current) =>
          reduceChatUnreadCount(current, { type: 'read', remaining }),
        )
        await liveSessionRef.current?.publishReceipt({
          kind: 'read',
          sequence,
        })
      } catch (nextError) {
        setError(getErrorMessage(nextError))
      }
    },
    [gateway],
  )

  return {
    messages: viewMessages,
    unreadCount,
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
