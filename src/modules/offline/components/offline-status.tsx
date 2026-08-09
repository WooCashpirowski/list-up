'use client'

import { Cloud, LoaderCircle, WifiOff } from 'lucide-react'

import { useI18n } from '@/src/modules/i18n'

import type { OfflineSyncState } from '../types/offline.types'

export function OfflineStatus({ state }: { state: OfflineSyncState }) {
  const { t } = useI18n()

  if (state.isOnline && !state.isSyncing && state.pending === 0) return null

  const message = !state.isOnline
    ? t('offline.disconnected', { count: state.pending })
    : state.isSyncing
      ? t('offline.syncing', { count: state.pending })
      : state.lastError
        ? t('offline.syncFailed', { count: state.pending })
        : t('offline.pending', { count: state.pending })

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-24 z-40 mx-auto flex max-w-md items-center gap-2 rounded-2xl border border-border bg-background/95 px-4 py-3 text-sm text-foreground shadow-lg backdrop-blur-xl"
    >
      {!state.isOnline ? (
        <WifiOff className="size-4 shrink-0 text-amber-600" />
      ) : state.isSyncing ? (
        <LoaderCircle className="size-4 shrink-0 animate-spin text-primary" />
      ) : (
        <Cloud className="size-4 shrink-0 text-primary" />
      )}
      <span>{message}</span>
    </div>
  )
}
