'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { getErrorMessage } from '@/src/lib/get-error-message'
import {
  getCachedCollection,
  isBrowserOnline,
  migrateLegacyChatStorage,
  OUTBOX_SYNCED_EVENT,
  saveCachedCollection,
} from '@/src/modules/offline'

import { createSupabaseChatGateway } from '../services/supabase-chat.gateway'
import type { ChatConversationSummary } from '../types/chat.types'

export function useChatInbox(userId: string) {
  const gateway = useMemo(() => createSupabaseChatGateway(), [])
  const [conversations, setConversations] = useState<ChatConversationSummary[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasHydratedCache, setHasHydratedCache] = useState(false)
  const deliveredSequencesRef = useRef(new Map<string, number>())

  const acknowledgeInboxDeliveries = useCallback(
    async (items: ChatConversationSummary[]): Promise<void> => {
      if (!isBrowserOnline()) return
      await Promise.all(
        items.map(async (conversation) => {
          const sequence = conversation.last_incoming_sequence
          if (
            sequence === null ||
            sequence <=
              (deliveredSequencesRef.current.get(conversation.conversation_id) ?? 0)
          ) {
            return
          }

          try {
            const delivered = await gateway.markDeliveredThrough(sequence)
            deliveredSequencesRef.current.set(
              conversation.conversation_id,
              delivered,
            )
          } catch (nextError) {
            setError(getErrorMessage(nextError))
          }
        }),
      )
    },
    [gateway],
  )

  const refresh = useCallback(async () => {
    if (!isBrowserOnline()) return
    try {
      const [nextConversations, nextUnreadCount] = await Promise.all([
        gateway.getInbox(),
        gateway.getUnreadCount(),
      ])
      setConversations(nextConversations)
      setUnreadCount(nextUnreadCount)
      setError(null)
      void acknowledgeInboxDeliveries(nextConversations)

      if (nextConversations.length === 1) {
        await migrateLegacyChatStorage(
          userId,
          nextConversations[0].conversation_id,
        )
      }
    } catch (nextError) {
      setError(getErrorMessage(nextError))
    } finally {
      setIsLoading(false)
    }
  }, [acknowledgeInboxDeliveries, gateway, userId])

  useEffect(() => {
    let mounted = true
    void getCachedCollection<ChatConversationSummary>(userId, 'chat-inbox')
      .then((cached) => {
        if (mounted && cached) setConversations(cached)
      })
      .catch((nextError) => {
        if (mounted) setError(getErrorMessage(nextError))
      })
      .finally(() => {
        if (!mounted) return
        setHasHydratedCache(true)
        void refresh()
      })

    const unsubscribe = gateway.subscribeInbox(userId, {
      onChanged: () => void refresh(),
      onMessage: () => void refresh(),
    })
    const handleRefresh = () => void refresh()
    window.addEventListener('focus', handleRefresh)
    window.addEventListener(OUTBOX_SYNCED_EVENT, handleRefresh)

    return () => {
      mounted = false
      unsubscribe()
      window.removeEventListener('focus', handleRefresh)
      window.removeEventListener(OUTBOX_SYNCED_EVENT, handleRefresh)
    }
  }, [gateway, refresh, userId])

  useEffect(() => {
    if (!hasHydratedCache) return
    void saveCachedCollection(userId, 'chat-inbox', conversations)
  }, [conversations, hasHydratedCache, userId])

  return {
    conversations,
    unreadCount,
    isLoading,
    error,
    refresh,
  }
}
