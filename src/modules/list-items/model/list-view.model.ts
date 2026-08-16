import type { ListItem } from '../types/list-item.types'

export const UNCATEGORIZED_ID = '__other__'

export type ListCategoryReference = {
  id: string
  name: string
}

export type CategoryGroup = {
  id: string
  isUncategorized: boolean
  name: string
  items: ListItem[]
}

export function reconcileCategoryOrder(
  categories: ListCategoryReference[],
  categoryOrder: string[],
): string[] {
  const allCategoryIds = [
    ...categories.map(({ id }) => id),
    UNCATEGORIZED_ID,
  ]

  return [
    ...categoryOrder.filter((id) => allCategoryIds.includes(id)),
    ...allCategoryIds.filter((id) => !categoryOrder.includes(id)),
  ]
}

export function sortItemsByCompletion(items: ListItem[]): ListItem[] {
  return [...items].sort((left, right) =>
    left.is_done === right.is_done ? 0 : left.is_done ? 1 : -1,
  )
}

export function buildCategoryGroups(
  categories: ListCategoryReference[],
  items: ListItem[],
  categoryOrder: string[],
  uncategorizedName: string,
): CategoryGroup[] {
  const byCategory = new Map<string, ListItem[]>()

  for (const item of items) {
    const key = item.category_id ?? UNCATEGORIZED_ID
    const groupItems = byCategory.get(key) ?? []
    groupItems.push(item)
    byCategory.set(key, groupItems)
  }

  const categoryById = new Map(
    categories.map((category) => [category.id, category]),
  )

  return categoryOrder
    .map((id): CategoryGroup | null => {
      const groupItems = byCategory.get(id) ?? []
      if (groupItems.length === 0) return null

      const category = categoryById.get(id)
      return {
        id,
        isUncategorized: id === UNCATEGORIZED_ID,
        name: category?.name ?? uncategorizedName,
        items: sortItemsByCompletion(groupItems),
      }
    })
    .filter((group): group is CategoryGroup => group !== null)
}

export function countCompletedItems(items: ListItem[]): number {
  return items.reduce((count, item) => count + Number(item.is_done), 0)
}
