import type { AppSupabaseClient } from '@/src/lib/supabase/service-client'

import type { PushSubscriptionInput } from '../types/notification.types'

export async function saveSubscription(
  input: PushSubscriptionInput,
  supabase: AppSupabaseClient,
): Promise<void> {
  await supabase
    .from('push_subscriptions')
    .upsert(
      {
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        user_agent: input.userAgent,
        is_active: true,
      },
      { onConflict: 'endpoint' },
    )
    .throwOnError()
}

export async function removeSubscription(
  endpoint: string,
  supabase: AppSupabaseClient,
): Promise<void> {
  await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .throwOnError()
}
