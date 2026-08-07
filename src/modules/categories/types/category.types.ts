export type Category = {
  id: string
  name: string
  order_index: number
  keywords: string[]
  created_by: string | null
  created_at: string
  updated_at: string
}

export type CategoryInsert = {
  id?: string
  name: string
  order_index?: number
  keywords?: string[]
  created_by?: string | null
  created_at?: string
  updated_at?: string
}

export type CategoryUpdate = {
  id?: string
  name?: string
  order_index?: number
  keywords?: string[]
  created_by?: string | null
  created_at?: string
  updated_at?: string
}

export type CreateCategoryInput = Pick<
  CategoryInsert,
  'id' | 'name' | 'order_index' | 'keywords'
>

export type UpdateCategoryInput = Pick<
  CategoryUpdate,
  'name' | 'order_index' | 'keywords'
>
