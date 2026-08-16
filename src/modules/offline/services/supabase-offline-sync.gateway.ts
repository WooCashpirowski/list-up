import type { AppSupabaseClient } from '@/src/lib/supabase/service-client'
import { resolveSupabaseClient } from '@/src/lib/supabase/service-client'

import type { OfflineSyncGateway } from '../gateways/offline-sync.gateway'
import { synchronizeOutbox } from './offline-sync.service'

export function createSupabaseOfflineSyncGateway(
  client?: AppSupabaseClient,
): OfflineSyncGateway {
  const supabase = resolveSupabaseClient(client)

  return {
    synchronize: (userId) => synchronizeOutbox(userId, supabase),
  }
}
