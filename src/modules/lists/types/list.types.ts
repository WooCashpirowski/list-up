export type ListType = 'shopping' | 'todo'

export type List = {
  id: string
  title: string
  list_type: ListType
  created_by: string | null
  created_at: string
  updated_at: string
}

export type ListInsert = {
  id?: string
  title: string
  list_type?: ListType
  created_by?: string | null
  created_at?: string
  updated_at?: string
}

export type ListUpdate = {
  id?: string
  title?: string
  list_type?: ListType
  created_by?: string | null
  created_at?: string
  updated_at?: string
}

export type CreateListInput = Pick<ListInsert, 'id' | 'title' | 'list_type'>

export type UpdateListInput = Pick<ListUpdate, 'title'>
