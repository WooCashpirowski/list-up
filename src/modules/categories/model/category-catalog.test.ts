import { expect, test } from '@playwright/test'

import type { Category } from '../types/category.types'
import { getCategoryEmoji, getCategoryTone } from './category-appearance'
import { buildCategoryCatalog, filterCategoryCatalog } from './category-catalog'

function createCategory(
  id: string,
  name: string,
  keywords: string[] = [],
): Category {
  return {
    id,
    name,
    keywords,
    order_index: 0,
    created_by: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }
}

test('builds a deduplicated catalog from keywords and assigned items', () => {
  const dairy = createCategory('dairy', 'Nabiał', [' Milk ', 'milk', ''])
  const produce = createCategory('produce', 'Warzywa', ['Brokuły'])

  const catalog = buildCategoryCatalog([dairy, produce], [
    { category_id: 'dairy', name: ' MILK ' },
    { category_id: 'dairy', name: 'Jogurt' },
    { category_id: 'missing', name: 'Ignored' },
    { category_id: null, name: 'Uncategorized' },
  ])

  expect(catalog).toEqual([
    { category: dairy, itemNames: ['MILK', 'Jogurt'] },
    { category: produce, itemNames: ['Brokuły'] },
  ])
})

test('filters the catalog by category and item name', () => {
  const catalog = buildCategoryCatalog(
    [
      createCategory('dairy', 'Nabiał'),
      createCategory('produce', 'Warzywa'),
    ],
    [
      { category_id: 'dairy', name: 'Jogurt grecki' },
      { category_id: 'produce', name: 'Pomidor' },
    ],
  )

  expect(filterCategoryCatalog(catalog, ' jogurt ')).toEqual([catalog[0]])
  expect(filterCategoryCatalog(catalog, 'WARZ')).toEqual([catalog[1]])
  expect(filterCategoryCatalog(catalog, '   ')).toBe(catalog)
})

test('derives category appearance outside of the view component', () => {
  expect(getCategoryEmoji('Świeże warzywa')).toBe('🥦')
  expect(getCategoryEmoji('Pozostałe')).toBe('🏷️')
  expect(getCategoryTone('Świeże zioła')).toBe('produce')
  expect(getCategoryTone('Chemia gospodarcza')).toBe('home')
})
