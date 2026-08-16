'use client'

import { useMemo, useState } from 'react'

import {
  buildCategoryCatalog,
  filterCategoryCatalog,
  type CategoryItemReference,
} from '../model/category-catalog'
import type { Category } from '../types/category.types'

export function useCategorySearch(
  categories: Category[],
  items: CategoryItemReference[],
) {
  const [query, setQuery] = useState('')
  const catalog = useMemo(
    () => buildCategoryCatalog(categories, items),
    [categories, items],
  )
  const entries = useMemo(
    () => filterCategoryCatalog(catalog, query),
    [catalog, query],
  )

  return { entries, query, setQuery }
}
