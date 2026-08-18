import type { AppSupabaseClient } from '@/src/lib/supabase/service-client'

import type {
  CreateChatMessageInput,
  PersistedChatMessage,
} from '../types/chat.types'
import { toChatMessage } from './chat.mapper'

export async function getLatestMessages(
  limit: number,
  supabase: AppSupabaseClient,
): Promise<PersistedChatMessage[]> {
  const { data } = await supabase
    .from('chat_messages')
    .select('*')
    .order('sequence', { ascending: false })
    .limit(limit)
    .throwOnError()

  return data.map(toChatMessage).reverse()
}

export async function getMessagesBefore(
  sequence: number,
  limit: number,
  supabase: AppSupabaseClient,
): Promise<PersistedChatMessage[]> {
  const { data } = await supabase
    .from('chat_messages')
    .select('*')
    .lt('sequence', sequence)
    .order('sequence', { ascending: false })
    .limit(limit)
    .throwOnError()

  return data.map(toChatMessage).reverse()
}

export async function createMessage(
  input: CreateChatMessageInput,
  supabase: AppSupabaseClient,
): Promise<PersistedChatMessage> {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert(input)
    .select('*')
    .single()

  if (!error && data) return toChatMessage(data)
  if (error?.code !== '23505') throw error

  const { data: existing } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('id', input.id)
    .single()
    .throwOnError()
  return toChatMessage(existing)
}

export async function getUnreadCount(
  supabase: AppSupabaseClient,
): Promise<number> {
  const { data } = await supabase.rpc('get_chat_unread_count').throwOnError()
  return Number(data ?? 0)
}

export async function markReadThrough(
  sequence: number,
  supabase: AppSupabaseClient,
): Promise<number> {
  const { data } = await supabase
    .rpc('mark_chat_read', { message_sequence: sequence })
    .throwOnError()
  return Number(data ?? 0)
}
