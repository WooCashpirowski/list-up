import type { Database } from '@/src/lib/supabase/database.types'

import type { List, ListType } from '../types/list.types'

export type ListRecord = Database['public']['Tables']['lists']['Row']

function toListType(value: string): ListType {
  return value === 'todo' ? 'todo' : 'shopping'
}

export function toList(record: ListRecord): List {
  return {
    ...record,
    list_type: toListType(record.list_type),
  }
}
