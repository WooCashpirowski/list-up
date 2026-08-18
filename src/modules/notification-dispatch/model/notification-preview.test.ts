import { expect, test } from '@playwright/test'

import { createNotificationPreview } from './notification-preview'

test('normalizes whitespace and limits a push preview to 120 characters', () => {
  const preview = createNotificationPreview(`  hello\n\n${'x'.repeat(140)}  `)
  expect(preview.startsWith('hello x')).toBe(true)
  expect(preview).toHaveLength(120)
  expect(preview.endsWith('…')).toBe(true)
})
