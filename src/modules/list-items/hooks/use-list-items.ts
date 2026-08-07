'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { getErrorMessage } from '@/src/lib/get-error-message'
import { createClient } from '@/src/lib/supabase/client'

import {
  clearListItems as clearListItemRecords,
  createListItem as createListItemRecord,
  deleteListItem as deleteListItemRecord,
  getAllListItems,
  updateListItem as updateListItemRecord,
} from '../services/list-items.service'
import type { ListItem } from '../types/list-item.types'

const DONE_RETENTION_MS = 5 * 60 * 1000

export type AddListItemInput = {
  listId: string
  categoryId: string | null
  name: string
  quantity: string | null
}

export function useListItems(userId: string) {
  const supabase = useMemo(() => createClient(), [])
  const [items, setItems] = useState<ListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setItems(await getAllListItems(supabase))
      setError(null)
    } catch (nextError) {
      setError(getErrorMessage(nextError))
    } finally {
      setIsLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refresh(), 0)

    const channel = supabase
      .channel(`list-items:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'list_items' },
        () => void refresh(),
      )
      .subscribe()

    return () => {
      window.clearTimeout(initialRefresh)
      void supabase.removeChannel(channel)
    }
  }, [refresh, supabase, userId])

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

      void Promise.allSettled(
        expiredIds.map((id) => deleteListItemRecord(id, supabase)),
      )
    }, delay)

    return () => window.clearTimeout(timer)
  }, [items, supabase])

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
        const created = await createListItemRecord(
          {
            id,
            list_id: input.listId,
            category_id: input.categoryId,
            name: trimmedName,
            quantity: input.quantity?.trim() || null,
          },
          supabase,
        )
        setItems((current) =>
          current.map((item) => (item.id === id ? created : item)),
        )
        setError(null)
        return true
      } catch (nextError) {
        setItems((current) => current.filter((item) => item.id !== id))
        setError(getErrorMessage(nextError))
        return false
      }
    },
    [supabase, userId],
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
        const updated = await updateListItemRecord(id, { is_done: isDone }, supabase)
        setItems((current) =>
          current.map((item) => (item.id === id ? updated : item)),
        )
        setError(null)
      } catch (nextError) {
        setItems((current) =>
          current.map((item) => (item.id === id ? previous : item)),
        )
        setError(getErrorMessage(nextError))
      }
    },
    [items, supabase],
  )

  const deleteItem = useCallback(
    async (id: string): Promise<void> => {
      const previousIndex = items.findIndex((item) => item.id === id)
      const previous = items[previousIndex]
      if (!previous) return

      setItems((current) => current.filter((item) => item.id !== id))

      try {
        await deleteListItemRecord(id, supabase)
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
    [items, supabase],
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
        await clearListItemRecords(listId, onlyDone, supabase)
        setError(null)
      } catch (nextError) {
        setItems((current) => [...current, ...removed])
        setError(getErrorMessage(nextError))
      }
    },
    [items, supabase],
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
