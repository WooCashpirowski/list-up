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
  getLatestMessages,
  getMessagesBefore,
  getPeerReceipt,
  getUnreadCount,
  markDeliveredThrough,
  markReadThrough,
} from './chat.service'

type ChatMessageRecord = Database['public']['Tables']['chat_messages']['Row']

export function createSupabaseChatGateway(
  client?: AppSupabaseClient,
): ChatGateway {
  const supabase = resolveSupabaseClient(client)

  return {
    getLatestMessages: (limit) => getLatestMessages(limit, supabase),
    getMessagesBefore: (sequence, limit) =>
      getMessagesBefore(sequence, limit, supabase),
    createMessage: (input) => createMessage(input, supabase),
    getUnreadCount: () => getUnreadCount(supabase),
    getPeerReceipt: () => getPeerReceipt(supabase),
    markDeliveredThrough: (sequence) =>
      markDeliveredThrough(sequence, supabase),
    markReadThrough: (sequence) => markReadThrough(sequence, supabase),
    subscribe: (userId, handlers) => {
      const clientId = crypto.randomUUID()
      let subscribed = false
      let pendingReceipts: Array<Omit<ChatReceiptEvent, 'user_id'>> = []
      let pendingTyping: boolean | null = null
      const channel = supabase
        .channel('list-up:chat:live', {
          config: { broadcast: { self: false }, private: true },
        })
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
          {
            event: '*',
            schema: 'public',
            table: 'chat_read_state',
            filter: `user_id=eq.${userId}`,
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
          if (pendingReceipts.length > 0) {
            for (const receipt of pendingReceipts) {
              void channel.send({
                type: 'broadcast',
                event: 'receipt',
                payload: { ...receipt, user_id: userId },
              })
            }
            pendingReceipts = []
          }
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
        publishReceipt: (receipt) => {
          if (!subscribed) {
            pendingReceipts.push(receipt)
            return Promise.resolve()
          }
          return broadcast('receipt', { ...receipt, user_id: userId })
        },
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
  }
}
