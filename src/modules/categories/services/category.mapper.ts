import type { Database, Json } from '@/src/lib/supabase/database.types'

import type { Category } from '../types/category.types'

export type CategoryRecord =
  Database['public']['Tables']['categories']['Row']

function toStringArray(value: Json): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string')
}

export function toCategory(record: CategoryRecord): Category {
  return {
    ...record,
    keywords: toStringArray(record.keywords),
  }
}
