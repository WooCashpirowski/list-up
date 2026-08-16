import type { Category } from '../types/category.types'

export type CategoryItemReference = {
  category_id: string | null
  name: string
}

export type CategoryCatalogEntry = {
  category: Category
  itemNames: string[]
}

export function buildCategoryCatalog(
  categories: Category[],
  items: CategoryItemReference[],
): CategoryCatalogEntry[] {
  const namesByCategory = new Map<string, Map<string, string>>()

  for (const category of categories) {
    const names = new Map<string, string>()
    for (const keyword of category.keywords) {
      const trimmedKeyword = keyword.trim()
      if (!trimmedKeyword) continue
      names.set(trimmedKeyword.toLocaleLowerCase('pl'), trimmedKeyword)
    }
    namesByCategory.set(category.id, names)
  }

  for (const item of items) {
    if (!item.category_id) continue
    const names = namesByCategory.get(item.category_id)
    if (!names) continue

    const trimmedName = item.name.trim()
    if (!trimmedName) continue
    names.set(trimmedName.toLocaleLowerCase('pl'), trimmedName)
  }

  return categories.map((category) => ({
    category,
    itemNames: Array.from(namesByCategory.get(category.id)?.values() ?? []),
  }))
}

export function filterCategoryCatalog(
  catalog: CategoryCatalogEntry[],
  query: string,
): CategoryCatalogEntry[] {
  const normalizedQuery = query.trim().toLocaleLowerCase('pl')
  if (!normalizedQuery) return catalog

  return catalog.filter(({ category, itemNames }) =>
    [category.name, ...itemNames].some((value) =>
      value.toLocaleLowerCase('pl').includes(normalizedQuery),
    ),
  )
}
