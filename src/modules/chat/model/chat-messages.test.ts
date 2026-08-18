import { expect, test } from '@playwright/test'

import {
  getLatestIncomingSequence,
  mergeChatMessages,
} from './chat-messages'
import type { ChatMessage } from '../types/chat.types'

function message(
  id: string,
  sequence: number | null,
  senderId = 'other',
): ChatMessage {
  return {
    id,
    sequence,
    sender_id: senderId,
    body: id,
    created_at: `2026-08-18T10:00:0${id.length}.000Z`,
    delivery_status: sequence === null ? 'queued' : 'sent',
  }
}

test('merges, deduplicates, and keeps optimistic messages last', () => {
  const result = mergeChatMessages(
    [message('one', 1), message('pending', null, 'me')],
    [message('two', 2), message('one', 1)],
  )

  expect(result.map(({ id }) => id)).toEqual(['one', 'two', 'pending'])
})

test('finds the newest persisted incoming message', () => {
  expect(
    getLatestIncomingSequence(
      [message('one', 1), message('two', 2, 'me'), message('three', 3)],
      'me',
    ),
  ).toBe(3)
})
