'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { getErrorMessage } from '@/src/lib/get-error-message'
import { createClient } from '@/src/lib/supabase/client'

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

  const refresh = useCallback(async () => {
    try {
      const records = await getLists(supabase)
      setLists(records)
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
      .channel(`lists:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lists' },
        () => void refresh(),
      )
      .subscribe()

    return () => {
      window.clearTimeout(initialRefresh)
      void supabase.removeChannel(channel)
    }
  }, [refresh, supabase, userId])

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
        const created = await createListRecord({ id, title: trimmedTitle }, supabase)
        setLists((current) =>
          sortLists(current.map((list) => (list.id === id ? created : list))),
        )
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
        const updated = await updateListRecord(id, { title: trimmedTitle }, supabase)
        setLists((current) =>
          sortLists(current.map((list) => (list.id === id ? updated : list))),
        )
        setError(null)
      } catch (nextError) {
        setLists((current) =>
          sortLists(current.map((list) => (list.id === id ? previous : list))),
        )
        setError(getErrorMessage(nextError))
      }
    },
    [lists, supabase],
  )

  const deleteList = useCallback(
    async (id: string): Promise<void> => {
      const previous = lists.find((list) => list.id === id)
      if (!previous) return

      setLists((current) => current.filter((list) => list.id !== id))

      try {
        await deleteListRecord(id, supabase)
        setError(null)
      } catch (nextError) {
        setLists((current) => sortLists([previous, ...current]))
        setError(getErrorMessage(nextError))
      }
    },
    [lists, supabase],
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
