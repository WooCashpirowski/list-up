import type { Database } from '@/src/lib/supabase/database.types'

import type { PersistedChatMessage } from '../types/chat.types'

export type ChatMessageRecord =
  Database['public']['Tables']['chat_messages']['Row']

export function toChatMessage(
  record: ChatMessageRecord,
): PersistedChatMessage {
  return { ...record, delivery_status: 'sent' }
}
