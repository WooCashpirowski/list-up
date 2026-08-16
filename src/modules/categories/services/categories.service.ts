import type { AppSupabaseClient } from '@/src/lib/supabase/service-client'
import { resolveSupabaseClient } from '@/src/lib/supabase/service-client'

import type {
  Category,
  CreateCategoryInput,
  UpdateCategoryInput,
} from '../types/category.types'
import { toCategory } from './category.mapper'

export async function getCategories(
  client?: AppSupabaseClient,
): Promise<Category[]> {
  const supabase = resolveSupabaseClient(client)
  const { data } = await supabase
    .from('categories')
    .select('*')
    .order('name', { ascending: true })
    .throwOnError()

  return data.map(toCategory)
}

export async function getCategoryById(
  id: string,
  client?: AppSupabaseClient,
): Promise<Category | null> {
  const supabase = resolveSupabaseClient(client)
  const { data } = await supabase
    .from('categories')
    .select('*')
    .eq('id', id)
    .maybeSingle()
    .throwOnError()

  return data ? toCategory(data) : null
}

export async function createCategory(
  input: CreateCategoryInput,
  client?: AppSupabaseClient,
): Promise<Category> {
  const supabase = resolveSupabaseClient(client)
  const { data } = await supabase
    .from('categories')
    .insert(input)
    .select('*')
    .single()
    .throwOnError()

  return toCategory(data)
}

export async function updateCategory(
  id: string,
  input: UpdateCategoryInput,
  client?: AppSupabaseClient,
): Promise<Category> {
  const supabase = resolveSupabaseClient(client)
  const { data } = await supabase
    .from('categories')
    .update(input)
    .eq('id', id)
    .select('*')
    .single()
    .throwOnError()

  return toCategory(data)
}

export async function deleteCategory(
  id: string,
  client?: AppSupabaseClient,
): Promise<Category> {
  const supabase = resolveSupabaseClient(client)
  const { data } = await supabase
    .from('categories')
    .delete()
    .eq('id', id)
    .select('*')
    .single()
    .throwOnError()

  return toCategory(data)
}
