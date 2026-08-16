import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

import type { CollectionChange } from '../collections/collection-change'

type IdentifiableRecord = {
  id: string
}

export function toCollectionChange<
  Record extends IdentifiableRecord,
  IncomingRecord extends IdentifiableRecord = Record,
>(
  payload: RealtimePostgresChangesPayload<IncomingRecord>,
  mapRecord: (record: IncomingRecord) => Record = (record) =>
    record as unknown as Record,
): CollectionChange<Record> | null {
  if (payload.eventType === 'DELETE') {
    const deletedId = payload.old.id
    if (typeof deletedId !== 'string') return null

    return { type: 'delete', id: deletedId }
  }

  return { type: 'upsert', record: mapRecord(payload.new) }
}
