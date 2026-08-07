export type ListItem = {
  id: string
  list_id: string
  category_id: string | null
  name: string
  quantity: string | null
  is_done: boolean
  done_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type ListItemInsert = {
  id?: string
  list_id: string
  category_id?: string | null
  name: string
  quantity?: string | null
  is_done?: boolean
  done_at?: string | null
  created_by?: string | null
  created_at?: string
  updated_at?: string
}

export type ListItemUpdate = {
  id?: string
  list_id?: string
  category_id?: string | null
  name?: string
  quantity?: string | null
  is_done?: boolean
  done_at?: string | null
  created_by?: string | null
  created_at?: string
  updated_at?: string
}

export type CreateListItemInput = Pick<
  ListItemInsert,
  'list_id' | 'category_id' | 'name' | 'quantity'
>

export type UpdateListItemInput = Pick<
  ListItemUpdate,
  'category_id' | 'name' | 'quantity' | 'is_done'
>
