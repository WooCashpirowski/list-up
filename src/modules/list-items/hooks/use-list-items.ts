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

import { createSupabaseListItemsGateway } from '../services/supabase-list-items.gateway'
import type { ListItem } from '../types/list-item.types'

const DONE_RETENTION_MS = 5 * 60 * 1000

export type AddListItemInput = {
  listId: string
  categoryId: string | null
  name: string
  quantity: string | null
}

export function useListItems(userId: string) {
  const gateway = useMemo(() => createSupabaseListItemsGateway(), [])
  const [items, setItems] = useState<ListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasHydratedCache, setHasHydratedCache] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setItems(await gateway.getAllListItems())
      setError(null)
    } catch (nextError) {
      if (!isNetworkFailure(nextError)) setError(getErrorMessage(nextError))
    } finally {
      setIsLoading(false)
    }
  }, [gateway])

  useEffect(() => {
    let active = true

    void getCachedCollection<ListItem>(userId, 'list-items')
      .then((cached) => {
        if (active && cached) setItems(cached)
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
      setItems((current) => applyCollectionChange(current, change))
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
    void saveCachedCollection(userId, 'list-items', items).catch((nextError) => {
      setError(getErrorMessage(nextError))
    })
  }, [hasHydratedCache, items, userId])

  useEffect(() => {
    const completed = items
      .filter((item) => item.is_done && item.done_at)
      .map((item) => ({
        item,
        expiresAt: new Date(item.done_at!).getTime() + DONE_RETENTION_MS,
      }))

    if (completed.length === 0) return

    const nextExpiry = Math.min(...completed.map(({ expiresAt }) => expiresAt))
    const delay = Math.max(0, nextExpiry - Date.now())

    const timer = window.setTimeout(() => {
      const now = Date.now()
      const expiredIds = completed
        .filter(({ expiresAt }) => expiresAt <= now)
        .map(({ item }) => item.id)

      if (expiredIds.length === 0) return

      setItems((current) =>
        current.filter((item) => !expiredIds.includes(item.id)),
      )

      const mutations = expiredIds.map((id) => ({
        userId,
        table: 'list_items' as const,
        operation: 'delete' as const,
        recordId: id,
      }))
      void executeOrQueueMutation(mutations, () =>
        Promise.all(expiredIds.map((id) => gateway.deleteListItem(id))),
      ).catch((nextError) => setError(getErrorMessage(nextError)))
    }, delay)

    return () => window.clearTimeout(timer)
  }, [gateway, items, userId])

  const addItem = useCallback(
    async (input: AddListItemInput): Promise<boolean> => {
      const trimmedName = input.name.trim()
      if (!trimmedName) return false

      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      const optimisticItem: ListItem = {
        id,
        list_id: input.listId,
        category_id: input.categoryId,
        name: trimmedName,
        quantity: input.quantity?.trim() || null,
        is_done: false,
        done_at: null,
        created_by: userId,
        created_at: now,
        updated_at: now,
      }

      setItems((current) => [...current, optimisticItem])

      try {
        const payload = {
          id,
          list_id: input.listId,
          category_id: input.categoryId,
          name: trimmedName,
          quantity: input.quantity?.trim() || null,
        }
        const result = await executeOrQueueMutation(
          {
            userId,
            table: 'list_items',
            operation: 'upsert',
            recordId: id,
            payload,
          },
          () => gateway.createListItem(payload),
        )
        if (result.status === 'synced') {
          setItems((current) =>
            current.map((item) => (item.id === id ? result.data : item)),
          )
        }
        setError(null)
        return true
      } catch (nextError) {
        setItems((current) => current.filter((item) => item.id !== id))
        setError(getErrorMessage(nextError))
        return false
      }
    },
    [gateway, userId],
  )

  const toggleItem = useCallback(
    async (id: string): Promise<void> => {
      const previous = items.find((item) => item.id === id)
      if (!previous) return

      const isDone = !previous.is_done
      const optimistic: ListItem = {
        ...previous,
        is_done: isDone,
        done_at: isDone ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }

      setItems((current) =>
        current.map((item) => (item.id === id ? optimistic : item)),
      )

      try {
        const result = await executeOrQueueMutation(
          {
            userId,
            table: 'list_items',
            operation: 'update',
            recordId: id,
            payload: { is_done: isDone },
          },
          () => gateway.updateListItem(id, { is_done: isDone }),
        )
        if (result.status === 'synced') {
          setItems((current) =>
            current.map((item) => (item.id === id ? result.data : item)),
          )
        }
        setError(null)
      } catch (nextError) {
        setItems((current) =>
          current.map((item) => (item.id === id ? previous : item)),
        )
        setError(getErrorMessage(nextError))
      }
    },
    [gateway, items, userId],
  )

  const deleteItem = useCallback(
    async (id: string): Promise<void> => {
      const previousIndex = items.findIndex((item) => item.id === id)
      const previous = items[previousIndex]
      if (!previous) return

      setItems((current) => current.filter((item) => item.id !== id))

      try {
        await executeOrQueueMutation(
          {
            userId,
            table: 'list_items',
            operation: 'delete',
            recordId: id,
          },
          () => gateway.deleteListItem(id),
        )
        setError(null)
      } catch (nextError) {
        setItems((current) => {
          const next = [...current]
          next.splice(previousIndex, 0, previous)
          return next
        })
        setError(getErrorMessage(nextError))
      }
    },
    [gateway, items, userId],
  )

  const clearItems = useCallback(
    async (listId: string, onlyDone = false): Promise<void> => {
      const removed = items.filter(
        (item) => item.list_id === listId && (!onlyDone || item.is_done),
      )
      if (removed.length === 0) return

      setItems((current) =>
        current.filter(
          (item) => item.list_id !== listId || (onlyDone && !item.is_done),
        ),
      )

      try {
        const mutations = removed.map((item) => ({
          userId,
          table: 'list_items' as const,
          operation: 'delete' as const,
          recordId: item.id,
        }))
        await executeOrQueueMutation(mutations, () =>
          gateway.clearListItems(listId, onlyDone),
        )
        setError(null)
      } catch (nextError) {
        setItems((current) => [...current, ...removed])
        setError(getErrorMessage(nextError))
      }
    },
    [gateway, items, userId],
  )

  return {
    items,
    isLoading,
    error,
    refresh,
    addItem,
    toggleItem,
    deleteItem,
    clearItems,
  }
}
