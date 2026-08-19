import type {
  ChatMessage,
  ChatMessageDeliveryStatus,
  ChatReceiptEvent,
  ChatReceiptState,
} from '../types/chat.types'

export const EMPTY_CHAT_RECEIPT: ChatReceiptState = {
  last_delivered_sequence: null,
  last_read_sequence: null,
}

function greatestNullable(
  current: number | null,
  incoming: number | null,
): number | null {
  if (current === null) return incoming
  if (incoming === null) return current
  return Math.max(current, incoming)
}

export function mergeChatReceipt(
  current: ChatReceiptState,
  incoming: ChatReceiptState,
): ChatReceiptState {
  const lastRead = greatestNullable(
    current.last_read_sequence,
    incoming.last_read_sequence,
  )
  const lastDelivered = greatestNullable(
    greatestNullable(
      current.last_delivered_sequence,
      incoming.last_delivered_sequence,
    ),
    lastRead,
  )

  return {
    last_delivered_sequence: lastDelivered,
    last_read_sequence: lastRead,
  }
}

export function applyChatReceiptEvent(
  current: ChatReceiptState,
  event: ChatReceiptEvent,
): ChatReceiptState {
  return mergeChatReceipt(current, {
    last_delivered_sequence: event.sequence,
    last_read_sequence: event.kind === 'read' ? event.sequence : null,
  })
}

export function resolveChatMessageDeliveryStatus(
  message: ChatMessage,
  currentUserId: string,
  peerReceipt: ChatReceiptState,
): ChatMessageDeliveryStatus {
  if (
    message.sender_id !== currentUserId ||
    message.sequence === null ||
    !['sent', 'delivered', 'read'].includes(message.delivery_status)
  ) {
    return message.delivery_status
  }

  if (
    peerReceipt.last_read_sequence !== null &&
    message.sequence <= peerReceipt.last_read_sequence
  ) {
    return 'read'
  }

  if (
    peerReceipt.last_delivered_sequence !== null &&
    message.sequence <= peerReceipt.last_delivered_sequence
  ) {
    return 'delivered'
  }

  return 'sent'
}
