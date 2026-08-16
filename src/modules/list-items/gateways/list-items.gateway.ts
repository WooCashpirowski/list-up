import type { CollectionChange } from '@/src/lib/collections/collection-change'

import type {
  CreateListItemInput,
  ListItem,
  UpdateListItemInput,
} from '../types/list-item.types'

export interface ListItemsGateway {
  getAllListItems: () => Promise<ListItem[]>
  createListItem: (input: CreateListItemInput) => Promise<ListItem>
  updateListItem: (
    id: string,
    input: UpdateListItemInput,
  ) => Promise<ListItem>
  deleteListItem: (id: string) => Promise<ListItem>
  clearListItems: (listId: string, onlyDone?: boolean) => Promise<void>
  subscribe: (
    subscriptionId: string,
    onChange: (change: CollectionChange<ListItem>) => void,
  ) => () => void
}
