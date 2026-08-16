import { expect, test } from '@playwright/test'

import { buildListProgress, formatRelativeListTime } from './list-progress'

test('aggregates total and remaining items per list', () => {
  const progress = buildListProgress([
    { list_id: 'shopping', is_done: false },
    { list_id: 'shopping', is_done: true },
    { list_id: 'todo', is_done: false },
  ])

  expect(progress.get('shopping')).toEqual({ total: 2, remaining: 1 })
  expect(progress.get('todo')).toEqual({ total: 1, remaining: 1 })
  expect(progress.has('missing')).toBe(false)
})

test('formats relative list update time against an explicit clock', () => {
  const now = Date.parse('2026-01-01T12:00:00.000Z')
  const formatter = new Intl.RelativeTimeFormat('en', {
    numeric: 'auto',
    style: 'narrow',
  })

  expect(
    formatRelativeListTime('2026-01-01T11:55:00.000Z', 'en', now),
  ).toBe(formatter.format(-5, 'minute'))
})
