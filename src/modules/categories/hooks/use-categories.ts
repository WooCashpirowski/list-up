'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { getErrorMessage } from '@/src/lib/get-error-message'
import { createClient } from '@/src/lib/supabase/client'

import {
  createCategory as createCategoryRecord,
  deleteCategory as deleteCategoryRecord,
  getCategories,
  updateCategory as updateCategoryRecord,
} from '../services/categories.service'
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

  const refresh = useCallback(async () => {
    try {
      setCategories(await getCategories(supabase))
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
      .channel(`categories:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'categories' },
        () => void refresh(),
      )
      .subscribe()

    return () => {
      window.clearTimeout(initialRefresh)
      void supabase.removeChannel(channel)
    }
  }, [refresh, supabase, userId])

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
        const created = await createCategoryRecord(
          {
            id,
            name: trimmedName,
            order_index: categories.length,
            keywords: [],
          },
          supabase,
        )
        setCategories((current) =>
          sortCategories(
            current.map((category) => (category.id === id ? created : category)),
          ),
        )
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
        const updated = await updateCategoryRecord(id, input, supabase)
        setCategories((current) =>
          sortCategories(
            current.map((category) => (category.id === id ? updated : category)),
          ),
        )
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
    [categories, supabase],
  )

  const renameCategory = useCallback(
    (id: string, name: string) => updateCategory(id, { name: name.trim() }),
    [updateCategory],
  )

  const deleteCategory = useCallback(
    async (id: string): Promise<void> => {
      const previous = categories.find((category) => category.id === id)
      if (!previous) return

      setCategories((current) => current.filter((category) => category.id !== id))

      try {
        await deleteCategoryRecord(id, supabase)
        setError(null)
      } catch (nextError) {
        setCategories((current) => sortCategories([...current, previous]))
        setError(getErrorMessage(nextError))
      }
    },
    [categories, supabase],
  )

  return {
    categories,
    isLoading,
    error,
    refresh,
    createCategory,
    updateCategory,
    renameCategory,
    deleteCategory,
  }
}
