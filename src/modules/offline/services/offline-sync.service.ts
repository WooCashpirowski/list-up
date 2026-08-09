import type { AppSupabaseClient } from '@/src/lib/supabase/service-client'
import { resolveSupabaseClient } from '@/src/lib/supabase/service-client'
import type { Database } from '@/src/lib/supabase/database.types'
import { getErrorMessage } from '@/src/lib/get-error-message'

import type {
  OutboxMutation,
  OutboxSyncResult,
  QueueMutationInput,
} from '../types/offline.types'
import {
  enqueueMutation,
  enqueueMutations,
  getOutboxMutations,
  OUTBOX_SYNCED_EVENT,
  recordOutboxFailure,
  removeOutboxMutation,
} from './offline-storage.service'

type ListsInsert = Database['public']['Tables']['lists']['Insert']
type ListsUpdate = Database['public']['Tables']['lists']['Update']
type CategoriesInsert = Database['public']['Tables']['categories']['Insert']
type CategoriesUpdate = Database['public']['Tables']['categories']['Update']
type ListItemsInsert = Database['public']['Tables']['list_items']['Insert']
type ListItemsUpdate = Database['public']['Tables']['list_items']['Update']

const activeSynchronizations = new Map<string, Promise<OutboxSyncResult>>()

export function isBrowserOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine
}

export function isNetworkFailure(error: unknown): boolean {
  if (!isBrowserOnline()) return true
  if (error instanceof TypeError) return true

  const message = getErrorMessage(error).toLocaleLowerCase('en')
  return [
    'failed to fetch',
    'fetch failed',
    'networkerror',
    'network request failed',
    'load failed',
  ].some((fragment) => message.includes(fragment))
}

export async function queueOfflineMutation(
  mutation: QueueMutationInput,
): Promise<void> {
  await enqueueMutation(mutation)
}

export async function executeOrQueueMutation<T>(
  mutations: QueueMutationInput | QueueMutationInput[],
  execute: () => Promise<T>,
): Promise<{ status: 'synced'; data: T } | { status: 'queued' }> {
  const queue = Array.isArray(mutations) ? mutations : [mutations]

  if (!isBrowserOnline()) {
    await enqueueMutations(queue)
    return { status: 'queued' }
  }

  try {
    return { status: 'synced', data: await execute() }
  } catch (error) {
    if (!isNetworkFailure(error)) throw error
    await enqueueMutations(queue)
    return { status: 'queued' }
  }
}

async function executeMutation(
  mutation: OutboxMutation,
  supabase: AppSupabaseClient,
): Promise<void> {
  if (mutation.table === 'lists') {
    if (mutation.operation === 'upsert') {
      await supabase
        .from('lists')
        .upsert(mutation.payload as ListsInsert, { onConflict: 'id' })
        .throwOnError()
    } else if (mutation.operation === 'update') {
      await supabase
        .from('lists')
        .update(mutation.payload as ListsUpdate)
        .eq('id', mutation.recordId)
        .throwOnError()
    } else {
      await supabase.from('lists').delete().eq('id', mutation.recordId).throwOnError()
    }
    return
  }

  if (mutation.table === 'categories') {
    if (mutation.operation === 'upsert') {
      await supabase
        .from('categories')
        .upsert(mutation.payload as CategoriesInsert, { onConflict: 'id' })
        .throwOnError()
    } else if (mutation.operation === 'update') {
      await supabase
        .from('categories')
        .update(mutation.payload as CategoriesUpdate)
        .eq('id', mutation.recordId)
        .throwOnError()
    } else {
      await supabase
        .from('categories')
        .delete()
        .eq('id', mutation.recordId)
        .throwOnError()
    }
    return
  }

  if (mutation.operation === 'upsert') {
    await supabase
      .from('list_items')
      .upsert(mutation.payload as ListItemsInsert, { onConflict: 'id' })
      .throwOnError()
  } else if (mutation.operation === 'update') {
    await supabase
      .from('list_items')
      .update(mutation.payload as ListItemsUpdate)
      .eq('id', mutation.recordId)
      .throwOnError()
  } else {
    await supabase
      .from('list_items')
      .delete()
      .eq('id', mutation.recordId)
      .throwOnError()
  }
}

async function runSynchronization(
  userId: string,
  client?: AppSupabaseClient,
): Promise<OutboxSyncResult> {
  const supabase = resolveSupabaseClient(client)
  const mutations = await getOutboxMutations(userId)
  const blockedRecords = new Set<string>()
  let synced = 0
  let failed = 0
  let lastError: string | null = null

  for (const mutation of mutations) {
    const recordKey = `${mutation.table}:${mutation.recordId}`
    if (blockedRecords.has(recordKey)) continue

    try {
      await executeMutation(mutation, supabase)
      await removeOutboxMutation(mutation.id)
      synced += 1
    } catch (error) {
      lastError = getErrorMessage(error)
      await recordOutboxFailure(mutation, lastError)
      failed += 1
      blockedRecords.add(recordKey)

      if (isNetworkFailure(error)) break
    }
  }

  const pending = (await getOutboxMutations(userId)).length
  if (typeof window !== 'undefined' && synced > 0) {
    window.dispatchEvent(new Event(OUTBOX_SYNCED_EVENT))
  }

  return { synced, failed, pending, lastError }
}

export function synchronizeOutbox(
  userId: string,
  client?: AppSupabaseClient,
): Promise<OutboxSyncResult> {
  const active = activeSynchronizations.get(userId)
  if (active) return active

  const synchronization = runSynchronization(userId, client).finally(() => {
    activeSynchronizations.delete(userId)
  })
  activeSynchronizations.set(userId, synchronization)
  return synchronization
}
