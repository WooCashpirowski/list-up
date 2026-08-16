import type { CollectionChange } from '@/src/lib/collections/collection-change'

import type {
  CreateListInput,
  List,
  UpdateListInput,
} from '../types/list.types'

export interface ListsGateway {
  getLists: () => Promise<List[]>
  createList: (input: CreateListInput) => Promise<List>
  updateList: (id: string, input: UpdateListInput) => Promise<List>
  deleteList: (id: string) => Promise<List>
  subscribe: (
    subscriptionId: string,
    onChange: (change: CollectionChange<List>) => void,
  ) => () => void
}
