export type List = {
  id: string
  title: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export type ListInsert = {
  id?: string
  title: string
  created_by?: string | null
  created_at?: string
  updated_at?: string
}

export type ListUpdate = {
  id?: string
  title?: string
  created_by?: string | null
  created_at?: string
  updated_at?: string
}

export type CreateListInput = Pick<ListInsert, 'title'>

export type UpdateListInput = Pick<ListUpdate, 'title'>
