import { expect, test } from '@playwright/test'

import { reduceChatUnreadCount } from './chat-unread'

test('increments incoming messages and replaces the count after a read cursor update', () => {
  expect(reduceChatUnreadCount(2, { type: 'incoming' })).toBe(3)
  expect(reduceChatUnreadCount(3, { type: 'read', remaining: 1 })).toBe(1)
  expect(reduceChatUnreadCount(1, { type: 'replace', count: -2 })).toBe(0)
})
