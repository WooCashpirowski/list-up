'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { applyCollectionChange } from '@/src/lib/collections/collection-change'
import { getErrorMessage } from '@/src/lib/get-error-message'
import {
  executeOrQueueMutation,
  getCachedCollection,
  isBrowserOnline,
  isNetworkFailure,
  OUTBOX_SYNCED_EVENT,
  saveCachedCollection,
} from '@/src/modules/offline'

import { createSupabaseListsGateway } from '../services/supabase-lists.gateway'
import type { List, ListType } from '../types/list.types'

function sortLists(lists: List[]): List[] {
  return lists
    .map((list) =>
      list.list_type === 'shopping' || list.list_type === 'todo'
        ? list
        : { ...list, list_type: 'shopping' as const },
    )
    .sort(
    (left, right) =>
      new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
    )
}

export function useLists(userId: string) {
  const gateway = useMemo(() => createSupabaseListsGateway(), [])
  const [lists, setLists] = useState<List[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasHydratedCache, setHasHydratedCache] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const records = await gateway.getLists()
      setLists(sortLists(records))
      setError(null)
    } catch (nextError) {
      if (!isNetworkFailure(nextError)) setError(getErrorMessage(nextError))
    } finally {
      setIsLoading(false)
    }
  }, [gateway])

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

    const unsubscribe = gateway.subscribe(userId, (change) => {
      setLists((current) => {
        const next = applyCollectionChange(current, change)
        return next === current ? current : sortLists(next)
      })
    })
    const handleOutboxSynced = () => void refresh()
    window.addEventListener(OUTBOX_SYNCED_EVENT, handleOutboxSynced)

    return () => {
      active = false
      window.removeEventListener(OUTBOX_SYNCED_EVENT, handleOutboxSynced)
      unsubscribe()
    }
  }, [gateway, refresh, userId])

  useEffect(() => {
    if (!hasHydratedCache) return
    void saveCachedCollection(userId, 'lists', lists).catch((nextError) => {
      setError(getErrorMessage(nextError))
    })
  }, [hasHydratedCache, lists, userId])

  const createList = useCallback(
    async (title: string, listType: ListType): Promise<string | null> => {
      const trimmedTitle = title.trim()
      if (!trimmedTitle) return null

      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      const optimisticList: List = {
        id,
        title: trimmedTitle,
        list_type: listType,
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
            payload: { id, title: trimmedTitle, list_type: listType },
          },
          () =>
            gateway.createList({
              id,
              title: trimmedTitle,
              list_type: listType,
            }),
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
    [gateway, userId],
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
          () => gateway.updateList(id, { title: trimmedTitle }),
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
    [gateway, lists, userId],
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
          () => gateway.deleteList(id),
        )
        setError(null)
      } catch (nextError) {
        setLists((current) => sortLists([previous, ...current]))
        setError(getErrorMessage(nextError))
      }
    },
    [gateway, lists, userId],
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
