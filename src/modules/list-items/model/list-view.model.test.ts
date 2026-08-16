import { expect, test } from '@playwright/test'

import type { ListItem } from '../types/list-item.types'
import {
  buildCategoryGroups,
  countCompletedItems,
  reconcileCategoryOrder,
  sortItemsByCompletion,
  UNCATEGORIZED_ID,
} from './list-view.model'

function createItem(
  id: string,
  categoryId: string | null,
  isDone = false,
): ListItem {
  return {
    id,
    list_id: 'list-1',
    category_id: categoryId,
    name: id,
    quantity: null,
    is_done: isDone,
    done_at: isDone ? '2026-01-01T00:00:00.000Z' : null,
    created_by: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }
}

test('reconciles saved category order with current categories', () => {
  expect(
    reconcileCategoryOrder(
      [
        { id: 'produce', name: 'Warzywa' },
        { id: 'bakery', name: 'Pieczywo' },
      ],
      ['removed', 'bakery'],
    ),
  ).toEqual(['bakery', 'produce', UNCATEGORIZED_ID])
})

test('builds ordered groups and keeps completed items at the end', () => {
  const openProduce = createItem('open-produce', 'produce')
  const doneProduce = createItem('done-produce', 'produce', true)
  const bakery = createItem('bakery', 'bakery')
  const other = createItem('other', null)
  const items = [doneProduce, other, openProduce, bakery]

  const groups = buildCategoryGroups(
    [
      { id: 'produce', name: 'Warzywa' },
      { id: 'bakery', name: 'Pieczywo' },
    ],
    items,
    ['bakery', 'produce', UNCATEGORIZED_ID],
    'Inne',
  )

  expect(groups.map(({ id }) => id)).toEqual([
    'bakery',
    'produce',
    UNCATEGORIZED_ID,
  ])
  expect(groups[1].items.map(({ id }) => id)).toEqual([
    'open-produce',
    'done-produce',
  ])
  expect(groups[2]).toMatchObject({
    isUncategorized: true,
    name: 'Inne',
  })
  expect(items.map(({ id }) => id)).toEqual([
    'done-produce',
    'other',
    'open-produce',
    'bakery',
  ])
})

test('sorts todo items without mutation and counts completed items', () => {
  const doneFirst = createItem('done-first', null, true)
  const open = createItem('open', null)
  const doneSecond = createItem('done-second', null, true)
  const items = [doneFirst, open, doneSecond]

  expect(sortItemsByCompletion(items).map(({ id }) => id)).toEqual([
    'open',
    'done-first',
    'done-second',
  ])
  expect(items[0]).toBe(doneFirst)
  expect(countCompletedItems(items)).toBe(2)
})
