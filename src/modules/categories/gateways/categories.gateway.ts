import type { CollectionChange } from '@/src/lib/collections/collection-change'

import type {
  Category,
  CreateCategoryInput,
  UpdateCategoryInput,
} from '../types/category.types'

export interface CategoriesGateway {
  getCategories: () => Promise<Category[]>
  createCategory: (input: CreateCategoryInput) => Promise<Category>
  updateCategory: (
    id: string,
    input: UpdateCategoryInput,
  ) => Promise<Category>
  deleteCategory: (id: string) => Promise<Category>
  subscribe: (
    subscriptionId: string,
    onChange: (change: CollectionChange<Category>) => void,
  ) => () => void
}
