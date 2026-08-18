import { expect, test } from '@playwright/test'

import {
  removeSubscription,
  saveSubscription,
} from '../services/notifications.service'

test('persists and removes only the current push endpoint', async () => {
  let savedPayload: unknown
  let conflictColumn: unknown
  let removedColumn: unknown
  let removedEndpoint: unknown

  const client = {
    from: (table: string) => {
      expect(table).toBe('push_subscriptions')
      return {
        upsert: (payload: unknown, options: { onConflict: string }) => {
          savedPayload = payload
          conflictColumn = options.onConflict
          return { throwOnError: async () => undefined }
        },
        delete: () => ({
          eq: (column: string, endpoint: string) => {
            removedColumn = column
            removedEndpoint = endpoint
            return { throwOnError: async () => undefined }
          },
        }),
      }
    },
  }

  await saveSubscription(
    {
      endpoint: 'https://push.example/device',
      p256dh: 'public-key',
      auth: 'auth-key',
      userAgent: 'test-agent',
    },
    client as never,
  )
  await removeSubscription('https://push.example/device', client as never)

  expect(savedPayload).toEqual({
    endpoint: 'https://push.example/device',
    p256dh: 'public-key',
    auth: 'auth-key',
    user_agent: 'test-agent',
    is_active: true,
  })
  expect(conflictColumn).toBe('endpoint')
  expect(removedColumn).toBe('endpoint')
  expect(removedEndpoint).toBe('https://push.example/device')
})
