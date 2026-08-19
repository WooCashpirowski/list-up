import { expect, test } from '@playwright/test'

import type { ChatMessage } from '../types/chat.types'
import {
  applyChatReceiptEvent,
  EMPTY_CHAT_RECEIPT,
  mergeChatReceipt,
  resolveChatMessageDeliveryStatus,
} from './chat-receipts'

function ownMessage(sequence: number): ChatMessage {
  return {
    id: String(sequence),
    sequence,
    sender_id: 'me',
    body: 'message',
    created_at: '2026-08-19T10:00:00.000Z',
    delivery_status: 'sent',
  }
}

test('receipt cursors advance monotonically and read implies delivered', () => {
  const delivered = applyChatReceiptEvent(EMPTY_CHAT_RECEIPT, {
    user_id: 'peer',
    kind: 'delivered',
    sequence: 8,
  })
  const read = applyChatReceiptEvent(delivered, {
    user_id: 'peer',
    kind: 'read',
    sequence: 7,
  })
  const stale = mergeChatReceipt(read, {
    last_delivered_sequence: 3,
    last_read_sequence: 2,
  })

  expect(stale).toEqual({
    last_delivered_sequence: 8,
    last_read_sequence: 7,
  })
})

test('maps a persisted own message to sent, delivered, or read', () => {
  expect(
    resolveChatMessageDeliveryStatus(ownMessage(5), 'me', EMPTY_CHAT_RECEIPT),
  ).toBe('sent')
  expect(
    resolveChatMessageDeliveryStatus(ownMessage(5), 'me', {
      last_delivered_sequence: 5,
      last_read_sequence: null,
    }),
  ).toBe('delivered')
  expect(
    resolveChatMessageDeliveryStatus(ownMessage(5), 'me', {
      last_delivered_sequence: 6,
      last_read_sequence: 5,
    }),
  ).toBe('read')
})
