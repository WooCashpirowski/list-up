import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

import type { AppSupabaseClient } from '@/src/lib/supabase/service-client'
import { resolveSupabaseClient } from '@/src/lib/supabase/service-client'
import { toCollectionChange } from '@/src/lib/supabase/realtime-collection'

import type { ListsGateway } from '../gateways/lists.gateway'
import { toList, type ListRecord } from './list.mapper'
import {
  createList,
  deleteList,
  getLists,
  updateList,
} from './lists.service'

export function createSupabaseListsGateway(
  client?: AppSupabaseClient,
): ListsGateway {
  const supabase = resolveSupabaseClient(client)

  return {
    getLists: () => getLists(supabase),
    createList: (input) => createList(input, supabase),
    updateList: (id, input) => updateList(id, input, supabase),
    deleteList: (id) => deleteList(id, supabase),
    subscribe: (subscriptionId, onChange) => {
      const channel = supabase
        .channel(`lists:${subscriptionId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'lists' },
          (payload: RealtimePostgresChangesPayload<ListRecord>) => {
            const change = toCollectionChange(payload, toList)
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
