'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { applyCollectionChange } from '@/src/lib/collections/collection-change'
import { getErrorMessage } from '@/src/lib/get-error-message'
import { getCachedCollection, saveCachedCollection } from '@/src/modules/offline'

import { createSupabaseProfilesGateway } from '../services/supabase-profiles.gateway'
import type { Profile } from '../types/profile.types'

export function useProfiles(userId: string) {
  const gateway = useMemo(() => createSupabaseProfilesGateway(), [])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [error, setError] = useState<string | null>(null)
  const [hasHydratedCache, setHasHydratedCache] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setProfiles(await gateway.getProfiles())
      setError(null)
    } catch (nextError) {
      setError(getErrorMessage(nextError))
    }
  }, [gateway])

  useEffect(() => {
    let active = true

    void getCachedCollection<Profile>(userId, 'profiles')
      .then((cached) => {
        if (active && cached) setProfiles(cached)
      })
      .finally(() => {
        if (!active) return
        setHasHydratedCache(true)
        void refresh()
      })

    const unsubscribe = gateway.subscribe(userId, (change) => {
      setProfiles((current) => applyCollectionChange(current, change))
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [gateway, refresh, userId])

  useEffect(() => {
    if (!hasHydratedCache) return
    void saveCachedCollection(userId, 'profiles', profiles)
  }, [hasHydratedCache, profiles, userId])

  const updateDisplayName = useCallback(
    async (displayName: string): Promise<boolean> => {
      const trimmed = displayName.trim()
      if (!trimmed || trimmed.length > 60) return false

      const previous = profiles.find(({ id }) => id === userId)
      if (!previous) return false

      setProfiles((current) =>
        current.map((profile) =>
          profile.id === userId
            ? { ...profile, display_name: trimmed }
            : profile,
        ),
      )

      try {
        const updated = await gateway.updateDisplayName(userId, trimmed)
        setProfiles((current) =>
          current.map((profile) => (profile.id === userId ? updated : profile)),
        )
        setError(null)
        return true
      } catch (nextError) {
        setProfiles((current) =>
          current.map((profile) => (profile.id === userId ? previous : profile)),
        )
        setError(getErrorMessage(nextError))
        return false
      }
    },
    [gateway, profiles, userId],
  )

  return { profiles, error, updateDisplayName }
}
