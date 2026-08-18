export type CachedCollectionName =
  | 'lists'
  | 'categories'
  | 'list-items'
  | 'chat-messages'
  | 'profiles'

export type OutboxTable = 'lists' | 'categories' | 'list_items' | 'chat_messages'

export type OutboxOperation = 'upsert' | 'update' | 'delete'

export type OutboxMutation = {
  id: string
  userId: string
  table: OutboxTable
  operation: OutboxOperation
  recordId: string
  payload: Record<string, unknown> | null
  createdAt: string
  sequence: number
  attempts: number
  lastError: string | null
}

export type QueueMutationInput = Pick<
  OutboxMutation,
  'userId' | 'table' | 'operation' | 'recordId'
> & {
  payload?: Record<string, unknown> | null
}

export type OutboxSyncResult = {
  synced: number
  failed: number
  pending: number
  lastError: string | null
}

export type OfflineSyncState = OutboxSyncResult & {
  isOnline: boolean
  isSyncing: boolean
}
