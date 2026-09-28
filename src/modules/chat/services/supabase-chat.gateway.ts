import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

import type { Database } from '@/src/lib/supabase/database.types'
import type { AppSupabaseClient } from '@/src/lib/supabase/service-client'
import { resolveSupabaseClient } from '@/src/lib/supabase/service-client'

import type { ChatGateway } from '../gateways/chat.gateway'
import type {
  ChatReadState,
  ChatReceiptEvent,
  ChatTypingEvent,
} from '../types/chat.types'
import { toChatMessage } from './chat.mapper'
import {
  createMessage,
  getInbox,
  getLatestMessages,
  getReactions,
  getMessagesBefore,
  getPeerReceipt,
  getUnreadCount,
  markDeliveredThrough,
  markReadThrough,
  setReaction,
  setPeerAlias,
  downloadPhoto,
} from './chat.service'

type ChatMessageRecord = Database['public']['Tables']['chat_messages']['Row']

export function createSupabaseChatGateway(
  client?: AppSupabaseClient,
): ChatGateway {
  const supabase = resolveSupabaseClient(client)

  return {
    getInbox: () => getInbox(supabase),
    getLatestMessages: (conversationId, limit) =>
      getLatestMessages(conversationId, limit, supabase),
    getMessagesBefore: (conversationId, sequence, limit) =>
      getMessagesBefore(conversationId, sequence, limit, supabase),
    createMessage: (input) => createMessage(input, supabase),
    getReactions: (conversationId) => getReactions(conversationId, supabase),
    setReaction: (messageId, emoji) => setReaction(messageId, emoji, supabase),
    setPeerAlias: (peerId, alias) => setPeerAlias(peerId, alias, supabase),
    downloadPhoto: (path) => downloadPhoto(path, supabase),
    getUnreadCount: () => getUnreadCount(supabase),
    getPeerReceipt: (conversationId) =>
      getPeerReceipt(conversationId, supabase),
    markDeliveredThrough: (sequence) =>
      markDeliveredThrough(sequence, supabase),
    markReadThrough: (sequence) => markReadThrough(sequence, supabase),
    subscribe: (userId, conversationId, handlers) => {
      const clientId = crypto.randomUUID()
      let subscribed = false
      let pendingTyping: boolean | null = null
      const channel = supabase
        .channel(`list-up:chat:${conversationId}:live`, {
          config: { broadcast: { self: false }, private: true },
        })
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'chat_messages',
            filter: `conversation_id=eq.${conversationId}`,
          },
          (payload: RealtimePostgresChangesPayload<ChatMessageRecord>) => {
            if (payload.eventType === 'INSERT') {
              handlers.onMessage(toChatMessage(payload.new))
            }
          },
        )
        .on(
          'postgres_changes',
          {
            event: '*', schema: 'public', table: 'chat_message_reactions',
            filter: `conversation_id=eq.${conversationId}`,
          },
          handlers.onReactionsChanged,
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'chat_read_state',
            filter: `conversation_id=eq.${conversationId}`,
          },
          (payload: RealtimePostgresChangesPayload<ChatReadState>) => {
            if (payload.eventType !== 'DELETE') handlers.onReadState(payload.new)
          },
        )
        .on<ChatReceiptEvent>(
          'broadcast',
          { event: 'receipt' },
          ({ payload }) => handlers.onReceipt(payload),
        )
        .on<ChatTypingEvent>(
          'broadcast',
          { event: 'typing' },
          ({ payload }) => handlers.onTyping(payload),
        )
        .subscribe((status) => {
          subscribed = status === 'SUBSCRIBED'
          if (!subscribed) return
          if (pendingTyping !== null) {
            void channel.send({
              type: 'broadcast',
              event: 'typing',
              payload: {
                user_id: userId,
                client_id: clientId,
                is_typing: pendingTyping,
              },
            })
            pendingTyping = null
          }
          handlers.onConnected()
        })

      async function broadcast(event: string, payload: object): Promise<void> {
        if (!subscribed) return
        await channel.send({ type: 'broadcast', event, payload })
      }

      return {
        setTyping: (isTyping) => {
          if (!subscribed) {
            pendingTyping = isTyping
            return Promise.resolve()
          }
          return broadcast('typing', {
            user_id: userId,
            client_id: clientId,
            is_typing: isTyping,
          })
        },
        unsubscribe: () => {
          subscribed = false
          void supabase.removeChannel(channel)
        },
      }
    },
    subscribeInbox: (userId, handlers) => {
      const channel = supabase
        .channel(`chat-inbox:${userId}:${crypto.randomUUID()}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'chat_messages' },
          (payload: RealtimePostgresChangesPayload<ChatMessageRecord>) => {
            if (payload.eventType === 'INSERT') {
              handlers.onMessage(toChatMessage(payload.new))
            }
          },
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'chat_conversations' },
          handlers.onChanged,
        )
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'chat_peer_aliases',
          filter: `owner_id=eq.${userId}`,
        }, handlers.onChanged)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'chat_read_state',
            filter: `user_id=eq.${userId}`,
          },
          handlers.onChanged,
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') handlers.onChanged()
        })

      return () => {
        void supabase.removeChannel(channel)
      }
    },
  }
}
