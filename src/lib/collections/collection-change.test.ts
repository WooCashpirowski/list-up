import { expect, test } from '@playwright/test'

import { applyCollectionChange } from './collection-change'

test('inserts, updates and deletes records without mutating the collection', () => {
  const original = [{ id: 'first', value: 1 }]
  const inserted = applyCollectionChange(original, {
    type: 'upsert',
    record: { id: 'second', value: 2 },
  })
  const updated = applyCollectionChange(inserted, {
    type: 'upsert',
    record: { id: 'first', value: 3 },
  })
  const deleted = applyCollectionChange(updated, {
    type: 'delete',
    id: 'second',
  })

  expect(original).toEqual([{ id: 'first', value: 1 }])
  expect(inserted).toEqual([
    { id: 'first', value: 1 },
    { id: 'second', value: 2 },
  ])
  expect(updated).toEqual([
    { id: 'first', value: 3 },
    { id: 'second', value: 2 },
  ])
  expect(deleted).toEqual([{ id: 'first', value: 3 }])
})

test('preserves the collection reference for an unknown deletion', () => {
  const records = [{ id: 'first' }]

  expect(
    applyCollectionChange(records, { type: 'delete', id: 'missing' }),
  ).toBe(records)
})
