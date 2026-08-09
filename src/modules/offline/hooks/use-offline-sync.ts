'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { getErrorMessage } from '@/src/lib/get-error-message'
import { createClient } from '@/src/lib/supabase/client'

import {
  getOutboxMutations,
  isBrowserOnline,
  OUTBOX_CHANGED_EVENT,
  synchronizeOutbox,
} from '../services'
import type { OfflineSyncState } from '../types/offline.types'

const RETRY_DELAY_MS = 15_000

export function useOfflineSync(userId: string): OfflineSyncState {
  const supabase = useMemo(() => createClient(), [])
  const [state, setState] = useState<OfflineSyncState>(() => ({
    isOnline: isBrowserOnline(),
    isSyncing: false,
    synced: 0,
    failed: 0,
    pending: 0,
    lastError: null,
  }))

  const refreshPendingCount = useCallback(async () => {
    try {
      const mutations = await getOutboxMutations(userId)
      setState((current) => ({ ...current, pending: mutations.length }))
    } catch (error) {
      setState((current) => ({
        ...current,
        lastError: getErrorMessage(error),
      }))
    }
  }, [userId])

  const synchronize = useCallback(async () => {
    if (!isBrowserOnline()) {
      setState((current) => ({ ...current, isOnline: false, isSyncing: false }))
      return
    }

    setState((current) => ({ ...current, isOnline: true, isSyncing: true }))

    try {
      const result = await synchronizeOutbox(userId, supabase)
      setState((current) => ({
        ...current,
        ...result,
        isOnline: true,
        isSyncing: false,
      }))
    } catch (error) {
      setState((current) => ({
        ...current,
        isOnline: isBrowserOnline(),
        isSyncing: false,
        lastError: getErrorMessage(error),
      }))
    }
  }, [supabase, userId])

  useEffect(() => {
    const handleOnline = () => {
      setState((current) => ({ ...current, isOnline: true }))
      void synchronize()
    }
    const handleOffline = () => {
      setState((current) => ({ ...current, isOnline: false, isSyncing: false }))
    }
    const handleOutboxChange = () => {
      void refreshPendingCount().then(() => {
        if (isBrowserOnline()) void synchronize()
      })
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener(OUTBOX_CHANGED_EVENT, handleOutboxChange)
    void refreshPendingCount().then(() => {
      if (isBrowserOnline()) void synchronize()
    })

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener(OUTBOX_CHANGED_EVENT, handleOutboxChange)
    }
  }, [refreshPendingCount, synchronize])

  useEffect(() => {
    if (!state.isOnline || state.isSyncing || state.pending === 0) return

    const retry = window.setTimeout(() => void synchronize(), RETRY_DELAY_MS)
    return () => window.clearTimeout(retry)
  }, [state.isOnline, state.isSyncing, state.pending, synchronize])

  return state
}
