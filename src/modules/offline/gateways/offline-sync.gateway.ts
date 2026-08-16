import type { OutboxSyncResult } from '../types/offline.types'

export interface OfflineSyncGateway {
  synchronize: (userId: string) => Promise<OutboxSyncResult>
}
