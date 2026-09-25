import type { Category } from '../types/category.types'

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('pl')
}

export function findCategoryForItem<T extends Pick<Category, 'name' | 'keywords'>>(
  itemName: string,
  categories: T[],
): T | null {
  const normalizedName = normalize(itemName)

  if (!normalizedName) {
    return null
  }

  return (
    categories.find((category) => {
      const candidates = [category.name, ...category.keywords].map(normalize)

      return candidates.some(
        (candidate) =>
          candidate === normalizedName ||
          (candidate.length >= 3 && normalizedName.includes(candidate)),
      )
    }) ?? null
  )
}
