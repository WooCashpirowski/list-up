import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

type IdentifiableRecord = {
  id: string
}

export function applyRealtimeChange<Record extends IdentifiableRecord>(
  records: Record[],
  payload: RealtimePostgresChangesPayload<Record>,
): Record[] {
  if (payload.eventType === 'DELETE') {
    const deletedId = payload.old.id
    if (typeof deletedId !== 'string') return records

    const next = records.filter(({ id }) => id !== deletedId)
    return next.length === records.length ? records : next
  }

  const changedRecord = payload.new
  const currentIndex = records.findIndex(({ id }) => id === changedRecord.id)

  if (currentIndex === -1) {
    return [...records, changedRecord]
  }

  const next = [...records]
  next[currentIndex] = changedRecord
  return next
}
