'use client'

import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { getErrorMessage } from '@/src/lib/get-error-message'
import { createClient } from '@/src/lib/supabase/client'
import { applyRealtimeChange } from '@/src/lib/supabase/realtime-collection'
import {
  executeOrQueueMutation,
  getCachedCollection,
  isBrowserOnline,
  isNetworkFailure,
  OUTBOX_SYNCED_EVENT,
  saveCachedCollection,
} from '@/src/modules/offline'

import {
  createCategory as createCategoryRecord,
  deleteCategory as deleteCategoryRecord,
  getCategories,
  updateCategory as updateCategoryRecord,
} from '../services/categories.service'
import {
  toCategory,
  type CategoryRecord,
} from '../services/category.mapper'
import type { Category, UpdateCategoryInput } from '../types/category.types'

function sortCategories(categories: Category[]): Category[] {
  return [...categories].sort((left, right) =>
    left.name.localeCompare(right.name, 'pl', { sensitivity: 'base' }),
  )
}

export function useCategories(userId: string) {
  const supabase = useMemo(() => createClient(), [])
  const [categories, setCategories] = useState<Category[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasHydratedCache, setHasHydratedCache] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setCategories(await getCategories(supabase))
      setError(null)
    } catch (nextError) {
      if (!isNetworkFailure(nextError)) setError(getErrorMessage(nextError))
    } finally {
      setIsLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    let active = true

    void getCachedCollection<Category>(userId, 'categories')
      .then((cached) => {
        if (!active) return
        if (cached) setCategories(sortCategories(cached))
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
      .channel(`categories:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'categories' },
        (payload: RealtimePostgresChangesPayload<CategoryRecord>) => {
          setCategories((current) => {
            const next = applyRealtimeChange(current, payload, toCategory)
            return next === current ? current : sortCategories(next)
          })
        },
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
    void saveCachedCollection(userId, 'categories', categories).catch(
      (nextError) => setError(getErrorMessage(nextError)),
    )
  }, [categories, hasHydratedCache, userId])

  const createCategory = useCallback(
    async (name: string): Promise<string | null> => {
      const trimmedName = name.trim()
      if (!trimmedName) return null

      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      const optimisticCategory: Category = {
        id,
        name: trimmedName,
        order_index: categories.length,
        keywords: [],
        created_by: userId,
        created_at: now,
        updated_at: now,
      }

      setCategories((current) => sortCategories([...current, optimisticCategory]))

      try {
        const payload = {
          id,
          name: trimmedName,
          order_index: categories.length,
          keywords: [],
        }
        const result = await executeOrQueueMutation(
          {
            userId,
            table: 'categories',
            operation: 'upsert',
            recordId: id,
            payload,
          },
          () => createCategoryRecord(payload, supabase),
        )
        if (result.status === 'synced') {
          setCategories((current) =>
            sortCategories(
              current.map((category) =>
                category.id === id ? result.data : category,
              ),
            ),
          )
        }
        setError(null)
        return id
      } catch (nextError) {
        setCategories((current) => current.filter((category) => category.id !== id))
        setError(getErrorMessage(nextError))
        return null
      }
    },
    [categories.length, supabase, userId],
  )

  const updateCategory = useCallback(
    async (id: string, input: UpdateCategoryInput): Promise<boolean> => {
      const previous = categories.find((category) => category.id === id)
      if (!previous) return false

      setCategories((current) =>
        sortCategories(
          current.map((category) =>
            category.id === id
              ? { ...category, ...input, updated_at: new Date().toISOString() }
              : category,
          ),
        ),
      )

      try {
        const result = await executeOrQueueMutation(
          {
            userId,
            table: 'categories',
            operation: 'update',
            recordId: id,
            payload: { ...input },
          },
          () => updateCategoryRecord(id, input, supabase),
        )
        if (result.status === 'synced') {
          setCategories((current) =>
            sortCategories(
              current.map((category) =>
                category.id === id ? result.data : category,
              ),
            ),
          )
        }
        setError(null)
        return true
      } catch (nextError) {
        setCategories((current) =>
          sortCategories(
            current.map((category) => (category.id === id ? previous : category)),
          ),
        )
        setError(getErrorMessage(nextError))
        return false
      }
    },
    [categories, supabase, userId],
  )

  const saveCategory = useCallback(
    (id: string, name: string, keywords: string[]) => {
      const uniqueKeywords = new Map<string, string>()
      for (const keyword of keywords) {
        const trimmedKeyword = keyword.trim()
        if (!trimmedKeyword) continue
        uniqueKeywords.set(trimmedKeyword.toLocaleLowerCase('pl'), trimmedKeyword)
      }

      return updateCategory(id, {
        name: name.trim(),
        keywords: Array.from(uniqueKeywords.values()),
      })
    },
    [updateCategory],
  )

  const deleteCategory = useCallback(
    async (id: string): Promise<void> => {
      const previous = categories.find((category) => category.id === id)
      if (!previous) return

      setCategories((current) => current.filter((category) => category.id !== id))

      try {
        await executeOrQueueMutation(
          {
            userId,
            table: 'categories',
            operation: 'delete',
            recordId: id,
          },
          () => deleteCategoryRecord(id, supabase),
        )
        setError(null)
      } catch (nextError) {
        setCategories((current) => sortCategories([...current, previous]))
        setError(getErrorMessage(nextError))
      }
    },
    [categories, supabase, userId],
  )

  return {
    categories,
    isLoading,
    error,
    refresh,
    createCategory,
    updateCategory,
    saveCategory,
    deleteCategory,
  }
}
