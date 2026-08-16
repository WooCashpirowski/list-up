export type CollectionChange<Record extends { id: string }> =
  | { type: 'upsert'; record: Record }
  | { type: 'delete'; id: string }

export function applyCollectionChange<Record extends { id: string }>(
  records: Record[],
  change: CollectionChange<Record>,
): Record[] {
  if (change.type === 'delete') {
    const next = records.filter(({ id }) => id !== change.id)
    return next.length === records.length ? records : next
  }

  const currentIndex = records.findIndex(({ id }) => id === change.record.id)
  if (currentIndex === -1) return [...records, change.record]

  const next = [...records]
  next[currentIndex] = change.record
  return next
}
