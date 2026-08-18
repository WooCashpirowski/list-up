import type { AppSupabaseClient } from '@/src/lib/supabase/service-client'
import { resolveSupabaseClient } from '@/src/lib/supabase/service-client'

import type { NotificationsGateway } from '../gateways/notifications.gateway'
import { removeSubscription, saveSubscription } from './notifications.service'

export function createSupabaseNotificationsGateway(
  client?: AppSupabaseClient,
): NotificationsGateway {
  const supabase = resolveSupabaseClient(client)
  return {
    saveSubscription: (input) => saveSubscription(input, supabase),
    removeSubscription: (endpoint) => removeSubscription(endpoint, supabase),
  }
}
