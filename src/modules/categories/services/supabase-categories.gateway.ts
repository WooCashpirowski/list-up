import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

import type { AppSupabaseClient } from '@/src/lib/supabase/service-client'
import { resolveSupabaseClient } from '@/src/lib/supabase/service-client'
import { toCollectionChange } from '@/src/lib/supabase/realtime-collection'

import type { CategoriesGateway } from '../gateways/categories.gateway'
import {
  createCategory,
  deleteCategory,
  getCategories,
  updateCategory,
} from './categories.service'
import { toCategory, type CategoryRecord } from './category.mapper'

export function createSupabaseCategoriesGateway(
  client?: AppSupabaseClient,
): CategoriesGateway {
  const supabase = resolveSupabaseClient(client)

  return {
    getCategories: () => getCategories(supabase),
    createCategory: (input) => createCategory(input, supabase),
    updateCategory: (id, input) => updateCategory(id, input, supabase),
    deleteCategory: (id) => deleteCategory(id, supabase),
    subscribe: (subscriptionId, onChange) => {
      const channel = supabase
        .channel(`categories:${subscriptionId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'categories' },
          (payload: RealtimePostgresChangesPayload<CategoryRecord>) => {
            const change = toCollectionChange(payload, toCategory)
            if (change) onChange(change)
          },
        )
        .subscribe()

      return () => {
        void supabase.removeChannel(channel)
      }
    },
  }
}
