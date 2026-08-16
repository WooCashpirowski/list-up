export type ListViewList = {
  id: string
  title: string
  list_type: 'shopping' | 'todo'
}

export type ListViewCategory = {
  id: string
  name: string
  keywords: string[]
}
