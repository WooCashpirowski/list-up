import type { CollectionChange } from '@/src/lib/collections/collection-change'

import type { Profile } from '../types/profile.types'

export interface ProfilesGateway {
  getProfiles: () => Promise<Profile[]>
  updateDisplayName: (id: string, displayName: string) => Promise<Profile>
  subscribe: (
    subscriptionId: string,
    onChange: (change: CollectionChange<Profile>) => void,
  ) => () => void
}
