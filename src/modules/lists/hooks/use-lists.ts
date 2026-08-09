'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { getErrorMessage } from '@/src/lib/get-error-message'
import { createClient } from '@/src/lib/supabase/client'
import {
  executeOrQueueMutation,
  getCachedCollection,
  isBrowserOnline,
  isNetworkFailure,
  OUTBOX_SYNCED_EVENT,
  saveCachedCollection,
} from '@/src/modules/offline'

import {
  createList as createListRecord,
  deleteList as deleteListRecord,
  getLists,
  updateList as updateListRecord,
} from '../services/lists.service'
import type { List } from '../types/list.types'

function sortLists(lists: List[]): List[] {
  return [...lists].sort(
    (left, right) =>
      new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
  )
}

export function useLists(userId: string) {
  const supabase = useMemo(() => createClient(), [])
  const [lists, setLists] = useState<List[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasHydratedCache, setHasHydratedCache] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const records = await getLists(supabase)
      setLists(records)
      setError(null)
    } catch (nextError) {
      if (!isNetworkFailure(nextError)) setError(getErrorMessage(nextError))
    } finally {
      setIsLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    let active = true

    void getCachedCollection<List>(userId, 'lists')
      .then((cached) => {
        if (!active) return
        if (cached) setLists(sortLists(cached))
      })
      .catch((nextError) => {
        if (active) setError(getErrorMessage(nextError))
      })
      .finally(() => {
        if (!active) return
        setHasHydratedCache(true)
        if (isBrowserOnline()) void refresh()
        else setIsLoading(false)
      })

    const channel = supabase
      .channel(`lists:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lists' },
        () => void refresh(),
      )
      .subscribe()
    const handleOutboxSynced = () => void refresh()
    window.addEventListener(OUTBOX_SYNCED_EVENT, handleOutboxSynced)

    return () => {
      active = false
      window.removeEventListener(OUTBOX_SYNCED_EVENT, handleOutboxSynced)
      void supabase.removeChannel(channel)
    }
  }, [refresh, supabase, userId])

  useEffect(() => {
    if (!hasHydratedCache) return
    void saveCachedCollection(userId, 'lists', lists).catch((nextError) => {
      setError(getErrorMessage(nextError))
    })
  }, [hasHydratedCache, lists, userId])

  const createList = useCallback(
    async (title: string): Promise<string | null> => {
      const trimmedTitle = title.trim()
      if (!trimmedTitle) return null

      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      const optimisticList: List = {
        id,
        title: trimmedTitle,
        created_by: userId,
        created_at: now,
        updated_at: now,
      }

      setLists((current) => sortLists([optimisticList, ...current]))

      try {
        const result = await executeOrQueueMutation(
          {
            userId,
            table: 'lists',
            operation: 'upsert',
            recordId: id,
            payload: { id, title: trimmedTitle },
          },
          () => createListRecord({ id, title: trimmedTitle }, supabase),
        )
        if (result.status === 'synced') {
          setLists((current) =>
            sortLists(current.map((list) => (list.id === id ? result.data : list))),
          )
        }
        setError(null)
        return id
      } catch (nextError) {
        setLists((current) => current.filter((list) => list.id !== id))
        setError(getErrorMessage(nextError))
        return null
      }
    },
    [supabase, userId],
  )

  const renameList = useCallback(
    async (id: string, title: string): Promise<void> => {
      const trimmedTitle = title.trim()
      const previous = lists.find((list) => list.id === id)
      if (!previous || !trimmedTitle) return

      const optimisticUpdatedAt = new Date().toISOString()
      setLists((current) =>
        sortLists(
          current.map((list) =>
            list.id === id
              ? { ...list, title: trimmedTitle, updated_at: optimisticUpdatedAt }
              : list,
          ),
        ),
      )

      try {
        const result = await executeOrQueueMutation(
          {
            userId,
            table: 'lists',
            operation: 'update',
            recordId: id,
            payload: { title: trimmedTitle },
          },
          () => updateListRecord(id, { title: trimmedTitle }, supabase),
        )
        if (result.status === 'synced') {
          setLists((current) =>
            sortLists(
              current.map((list) => (list.id === id ? result.data : list)),
            ),
          )
        }
        setError(null)
      } catch (nextError) {
        setLists((current) =>
          sortLists(current.map((list) => (list.id === id ? previous : list))),
        )
        setError(getErrorMessage(nextError))
      }
    },
    [lists, supabase, userId],
  )

  const deleteList = useCallback(
    async (id: string): Promise<void> => {
      const previous = lists.find((list) => list.id === id)
      if (!previous) return

      setLists((current) => current.filter((list) => list.id !== id))

      try {
        await executeOrQueueMutation(
          {
            userId,
            table: 'lists',
            operation: 'delete',
            recordId: id,
          },
          () => deleteListRecord(id, supabase),
        )
        setError(null)
      } catch (nextError) {
        setLists((current) => sortLists([previous, ...current]))
        setError(getErrorMessage(nextError))
      }
    },
    [lists, supabase, userId],
  )

  return {
    lists,
    isLoading,
    error,
    refresh,
    createList,
    renameList,
    deleteList,
  }
}
