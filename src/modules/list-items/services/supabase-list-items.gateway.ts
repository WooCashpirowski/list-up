import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

import type { AppSupabaseClient } from '@/src/lib/supabase/service-client'
import { resolveSupabaseClient } from '@/src/lib/supabase/service-client'
import { toCollectionChange } from '@/src/lib/supabase/realtime-collection'

import type { ListItemsGateway } from '../gateways/list-items.gateway'
import type { ListItem } from '../types/list-item.types'
import {
  clearListItems,
  createListItem,
  deleteListItem,
  getAllListItems,
  updateListItem,
} from './list-items.service'

export function createSupabaseListItemsGateway(
  client?: AppSupabaseClient,
): ListItemsGateway {
  const supabase = resolveSupabaseClient(client)

  return {
    getAllListItems: () => getAllListItems(supabase),
    createListItem: (input) => createListItem(input, supabase),
    updateListItem: (id, input) => updateListItem(id, input, supabase),
    deleteListItem: (id) => deleteListItem(id, supabase),
    clearListItems: (listId, onlyDone) =>
      clearListItems(listId, onlyDone, supabase),
    subscribe: (subscriptionId, onChange) => {
      const channel = supabase
        .channel(`list-items:${subscriptionId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'list_items' },
          (payload: RealtimePostgresChangesPayload<ListItem>) => {
            const change = toCollectionChange<ListItem>(payload)
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
