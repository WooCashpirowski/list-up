'use client'

import { useMemo } from 'react'

import {
  buildCategoryGroups,
  countCompletedItems,
  reconcileCategoryOrder,
  sortItemsByCompletion,
  type ListCategoryReference,
} from '../model/list-view.model'
import type { ListItem } from '../types/list-item.types'

export function useListViewModel(
  categories: ListCategoryReference[],
  items: ListItem[],
  categoryOrder: string[],
  uncategorizedName: string,
) {
  const effectiveCategoryOrder = useMemo(
    () => reconcileCategoryOrder(categories, categoryOrder),
    [categories, categoryOrder],
  )
  const groups = useMemo(
    () =>
      buildCategoryGroups(
        categories,
        items,
        effectiveCategoryOrder,
        uncategorizedName,
      ),
    [categories, effectiveCategoryOrder, items, uncategorizedName],
  )
  const todoItems = useMemo(() => sortItemsByCompletion(items), [items])
  const completedCount = useMemo(() => countCompletedItems(items), [items])

  return { completedCount, effectiveCategoryOrder, groups, todoItems }
}
