import type { AppSupabaseClient } from '@/src/lib/supabase/service-client'
import { resolveSupabaseClient } from '@/src/lib/supabase/service-client'

import type {
  CreateListInput,
  List,
  UpdateListInput,
} from '../types/list.types'
import { toList } from './list.mapper'

export async function getLists(client?: AppSupabaseClient): Promise<List[]> {
  const supabase = resolveSupabaseClient(client)
  const { data } = await supabase
    .from('lists')
    .select('*')
    .order('updated_at', { ascending: false })
    .throwOnError()

  return data.map(toList)
}

export async function getListById(
  id: string,
  client?: AppSupabaseClient,
): Promise<List | null> {
  const supabase = resolveSupabaseClient(client)
  const { data } = await supabase
    .from('lists')
    .select('*')
    .eq('id', id)
    .maybeSingle()
    .throwOnError()

  return data ? toList(data) : null
}

export async function createList(
  input: CreateListInput,
  client?: AppSupabaseClient,
): Promise<List> {
  const supabase = resolveSupabaseClient(client)
  const { data } = await supabase
    .from('lists')
    .insert(input)
    .select('*')
    .single()
    .throwOnError()

  return toList(data)
}

export async function updateList(
  id: string,
  input: UpdateListInput,
  client?: AppSupabaseClient,
): Promise<List> {
  const supabase = resolveSupabaseClient(client)
  const { data } = await supabase
    .from('lists')
    .update(input)
    .eq('id', id)
    .select('*')
    .single()
    .throwOnError()

  return toList(data)
}

export async function deleteList(
  id: string,
  client?: AppSupabaseClient,
): Promise<List> {
  const supabase = resolveSupabaseClient(client)
  const { data } = await supabase
    .from('lists')
    .delete()
    .eq('id', id)
    .select('*')
    .single()
    .throwOnError()

  return toList(data)
}
