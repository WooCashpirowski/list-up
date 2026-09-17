export type ChatMessageDeliveryStatus =
  | 'sending'
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'

export type ChatMessage = {
  id: string
  sequence: number | null
  conversation_id: string
  sender_id: string
  body: string
  created_at: string
  delivery_status: ChatMessageDeliveryStatus
}

export type PersistedChatMessage = Omit<
  ChatMessage,
  'sequence' | 'delivery_status'
> & {
  sequence: number
  delivery_status: 'sent'
}

export type CreateChatMessageInput = {
  id: string
  conversation_id: string
  body: string
}

export type ChatReadState = {
  conversation_id: string
  user_id: string
  last_delivered_sequence: number | null
  last_read_sequence: number | null
  updated_at: string
}

export type ChatReceiptState = {
  last_delivered_sequence: number | null
  last_read_sequence: number | null
}

export type ChatReceiptEvent = {
  user_id: string
  kind: 'delivered' | 'read'
  sequence: number
}

export type ChatTypingEvent = {
  user_id: string
  client_id: string
  is_typing: boolean
}

export type ChatConversationSummary = {
  conversation_id: string
  peer_id: string
  peer_email: string
  peer_display_name: string
  last_message_id: string | null
  last_message_sender_id: string | null
  last_message_body: string | null
  last_message_sequence: number | null
  last_message_created_at: string | null
  last_incoming_sequence: number | null
  unread_count: number
}
