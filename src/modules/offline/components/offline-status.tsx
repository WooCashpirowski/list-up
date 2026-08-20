'use client'

import { Cloud, LoaderCircle, WifiOff } from 'lucide-react'

import { cn } from '@/lib/utils'
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
  const tone = !state.isOnline
    ? 'border-warning/25 bg-warning-soft/95 text-warning'
    : state.isSyncing
      ? 'border-info/25 bg-info-soft/95 text-info'
      : state.lastError
        ? 'border-destructive/25 bg-destructive-soft/95 text-destructive'
        : 'border-success/25 bg-success-soft/95 text-success'

  return (
    <div
      role="status"
      className={cn(
        'surface-glass pointer-events-none fixed inset-x-4 bottom-24 z-40 mx-auto flex max-w-md items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium backdrop-blur-xl',
        tone,
      )}
    >
      {!state.isOnline ? (
        <WifiOff className="size-4 shrink-0" />
      ) : state.isSyncing ? (
        <LoaderCircle className="size-4 shrink-0 animate-spin" />
      ) : (
        <Cloud className="size-4 shrink-0" />
      )}
      <span>{message}</span>
    </div>
  )
}
