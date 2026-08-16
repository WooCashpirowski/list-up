'use client'

import { useMemo } from 'react'

import type { ItemSuggestion } from '../types/item-suggestion.types'
import type { ListViewCategory } from '../types/list-view.types'

const MIN_QUERY_LENGTH = 2

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('pl')
    .replace(/ł/g, 'l')
}

export function useItemSuggestions(
  categories: ListViewCategory[],
  query: string,
): ItemSuggestion[] {
  const catalog = useMemo(() => {
    const suggestions: ItemSuggestion[] = []

    for (const category of categories) {
      const categoryItems = new Set<string>()

      for (const keyword of category.keywords) {
        const name = keyword.trim()
        const normalizedName = normalize(name)
        if (!normalizedName || categoryItems.has(normalizedName)) continue

        categoryItems.add(normalizedName)
        suggestions.push({
          id: `${category.id}-${suggestions.length}`,
          name,
          categoryId: category.id,
          categoryName: category.name,
        })
      }
    }

    return suggestions.sort(
      (left, right) =>
        left.name.localeCompare(right.name, 'pl', { sensitivity: 'base' }) ||
        left.categoryName.localeCompare(right.categoryName, 'pl', {
          sensitivity: 'base',
        }),
    )
  }, [categories])

  return useMemo(() => {
    const normalizedQuery = normalize(query)
    if (normalizedQuery.length < MIN_QUERY_LENGTH) return []

    return catalog
      .filter((suggestion) => {
        const normalizedName = normalize(suggestion.name)
        const normalizedCategory = normalize(suggestion.categoryName)
        return (
          normalizedName.includes(normalizedQuery) ||
          normalizedCategory.includes(normalizedQuery)
        )
      })
      .sort((left, right) => {
        const leftStartsWith = normalize(left.name).startsWith(normalizedQuery)
        const rightStartsWith = normalize(right.name).startsWith(normalizedQuery)
        return leftStartsWith === rightStartsWith ? 0 : leftStartsWith ? -1 : 1
      })
  }, [catalog, query])
}
