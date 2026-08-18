import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

import type { AppSupabaseClient } from '@/src/lib/supabase/service-client'
import { resolveSupabaseClient } from '@/src/lib/supabase/service-client'
import { toCollectionChange } from '@/src/lib/supabase/realtime-collection'

import type { ProfilesGateway } from '../gateways/profiles.gateway'
import type { Profile } from '../types/profile.types'
import { getProfiles, updateProfile } from './profiles.service'

export function createSupabaseProfilesGateway(
  client?: AppSupabaseClient,
): ProfilesGateway {
  const supabase = resolveSupabaseClient(client)

  return {
    getProfiles: () => getProfiles(supabase),
    updateDisplayName: (id, displayName) =>
      updateProfile(id, { display_name: displayName }, supabase),
    subscribe: (subscriptionId, onChange) => {
      const channel = supabase
        .channel(`profiles:${subscriptionId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'profiles' },
          (payload: RealtimePostgresChangesPayload<Profile>) => {
            const change = toCollectionChange<Profile>(payload)
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
