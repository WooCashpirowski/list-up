'use client'

import { useCallback, useState } from 'react'

import { findCategoryForItem } from '@/src/modules/categories/services/category-matcher'
import type {
  Category,
  UpdateCategoryInput,
} from '@/src/modules/categories/types/category.types'

import type { AddListItemInput } from './use-list-items'

export type PendingItem = {
  name: string
  quantity: string | null
}

type StoredPendingItem = PendingItem & { listId: string }

type ItemComposerOptions = {
  listId: string | null
  categories: Category[]
  addItem: (input: AddListItemInput) => Promise<boolean>
  updateCategory: (id: string, input: UpdateCategoryInput) => Promise<boolean>
}

export function useItemComposer({
  listId,
  categories,
  addItem,
  updateCategory,
}: ItemComposerOptions) {
  const [storedPendingItem, setStoredPendingItem] =
    useState<StoredPendingItem | null>(null)
  const pendingItem =
    storedPendingItem?.listId === listId ? storedPendingItem : null

  const submitItem = useCallback(
    async (
      name: string,
      quantity: string,
      selectedCategoryId: string | 'auto',
    ): Promise<boolean> => {
      if (!listId || !name.trim()) return false

      const category =
        selectedCategoryId === 'auto'
          ? findCategoryForItem(name, categories)
          : categories.find(({ id }) => id === selectedCategoryId) ?? null

      if (selectedCategoryId === 'auto' && !category) {
        setStoredPendingItem({
          listId,
          name: name.trim(),
          quantity: quantity.trim() || null,
        })
        return false
      }

      return addItem({
        listId,
        categoryId: category?.id ?? null,
        name,
        quantity: quantity.trim() || null,
      })
    },
    [addItem, categories, listId],
  )

  const assignPendingItem = useCallback(
    async (categoryId: string): Promise<boolean> => {
      if (!listId || !pendingItem) return false

      const category = categories.find(({ id }) => id === categoryId)
      if (!category) return false

      const created = await addItem({
        listId,
        categoryId,
        name: pendingItem.name,
        quantity: pendingItem.quantity,
      })

      if (created) {
        const normalizedKeyword = pendingItem.name.trim().toLocaleLowerCase('pl')
        const hasKeyword = category.keywords.some(
          (keyword) => keyword.toLocaleLowerCase('pl') === normalizedKeyword,
        )

        if (!hasKeyword) {
          await updateCategory(categoryId, {
            keywords: [...category.keywords, normalizedKeyword],
          })
        }

        setStoredPendingItem(null)
      }

      return created
    },
    [addItem, categories, listId, pendingItem, updateCategory],
  )

  const keepPendingItemUncategorized = useCallback(async (): Promise<boolean> => {
    if (!listId || !pendingItem) return false

    const created = await addItem({
      listId,
      categoryId: null,
      name: pendingItem.name,
      quantity: pendingItem.quantity,
    })

    if (created) {
      setStoredPendingItem(null)
    }

    return created
  }, [addItem, listId, pendingItem])

  return {
    pendingItem,
    submitItem,
    assignPendingItem,
    keepPendingItemUncategorized,
    cancelPendingItem: () => setStoredPendingItem(null),
  }
}
