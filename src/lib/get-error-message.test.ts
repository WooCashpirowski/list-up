import { expect, test } from '@playwright/test'

import { getErrorMessage } from './get-error-message'

const FALLBACK = 'Something went wrong. Please try again.'

test('preserves messages from Error instances and Supabase error objects', () => {
  expect(getErrorMessage(new Error('Request failed'))).toBe('Request failed')
  expect(
    getErrorMessage({
      code: '42702',
      message: 'column reference "recipient_id" is ambiguous',
      details: 'Internal database context',
      hint: 'Internal database hint',
    }),
  ).toBe('column reference "recipient_id" is ambiguous')
})

test('normalizes string and object messages without stringifying unknown values', () => {
  expect(getErrorMessage('  Network request failed  ')).toBe(
    'Network request failed',
  )
  expect(getErrorMessage({ message: '  Permission denied  ' })).toBe(
    'Permission denied',
  )

  for (const error of [null, undefined, 42, false, {}, { message: 42 }]) {
    expect(getErrorMessage(error)).toBe(FALLBACK)
  }
})

test('uses the fallback for empty messages rather than displaying a blank alert', () => {
  for (const error of ['', '  ', new Error(''), { message: '\n\t' }]) {
    expect(getErrorMessage(error)).toBe(FALLBACK)
  }
})
