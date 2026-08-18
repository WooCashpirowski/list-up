import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

import type { Database } from '@/src/lib/supabase/database.types'
import type { AppSupabaseClient } from '@/src/lib/supabase/service-client'
import { resolveSupabaseClient } from '@/src/lib/supabase/service-client'

import type { ChatGateway } from '../gateways/chat.gateway'
import type { ChatReadState } from '../types/chat.types'
import { toChatMessage } from './chat.mapper'
import {
  createMessage,
  getLatestMessages,
  getMessagesBefore,
  getUnreadCount,
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
    markReadThrough: (sequence) => markReadThrough(sequence, supabase),
    subscribe: (userId, handlers) => {
      const channel = supabase
        .channel(`chat:${userId}`)
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
        .subscribe()

      return () => {
        void supabase.removeChannel(channel)
      }
    },
  }
}
