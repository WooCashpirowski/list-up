import type { AppSupabaseClient } from '@/src/lib/supabase/service-client'
import { resolveSupabaseClient } from '@/src/lib/supabase/service-client'

import type {
  CreateListItemInput,
  ListItem,
  UpdateListItemInput,
} from '../types/list-item.types'

export async function getAllListItems(
  client?: AppSupabaseClient,
): Promise<ListItem[]> {
  const supabase = resolveSupabaseClient(client)
  const { data } = await supabase
    .from('list_items')
    .select('*')
    .order('created_at', { ascending: true })
    .throwOnError()

  return data
}

export async function getListItems(
  listId: string,
  client?: AppSupabaseClient,
): Promise<ListItem[]> {
  const supabase = resolveSupabaseClient(client)
  const { data } = await supabase
    .from('list_items')
    .select('*')
    .eq('list_id', listId)
    .order('created_at', { ascending: true })
    .throwOnError()

  return data
}

export async function getListItemById(
  id: string,
  client?: AppSupabaseClient,
): Promise<ListItem | null> {
  const supabase = resolveSupabaseClient(client)
  const { data } = await supabase
    .from('list_items')
    .select('*')
    .eq('id', id)
    .maybeSingle()
    .throwOnError()

  return data
}

export async function createListItem(
  input: CreateListItemInput,
  client?: AppSupabaseClient,
): Promise<ListItem> {
  const supabase = resolveSupabaseClient(client)
  const { data } = await supabase
    .from('list_items')
    .insert(input)
    .select('*')
    .single()
    .throwOnError()

  return data
}

export async function updateListItem(
  id: string,
  input: UpdateListItemInput,
  client?: AppSupabaseClient,
): Promise<ListItem> {
  const supabase = resolveSupabaseClient(client)
  const { data } = await supabase
    .from('list_items')
    .update(input)
    .eq('id', id)
    .select('*')
    .single()
    .throwOnError()

  return data
}

export async function deleteListItem(
  id: string,
  client?: AppSupabaseClient,
): Promise<ListItem> {
  const supabase = resolveSupabaseClient(client)
  const { data } = await supabase
    .from('list_items')
    .delete()
    .eq('id', id)
    .select('*')
    .single()
    .throwOnError()

  return data
}

export async function clearListItems(
  listId: string,
  onlyDone = false,
  client?: AppSupabaseClient,
): Promise<void> {
  const supabase = resolveSupabaseClient(client)
  let query = supabase.from('list_items').delete().eq('list_id', listId)

  if (onlyDone) {
    query = query.eq('is_done', true)
  }

  await query.throwOnError()
}
