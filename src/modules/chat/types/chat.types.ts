export type ChatMessageDeliveryStatus =
  | 'sending'
  | 'queued'
  | 'sent'
  | 'failed'

export type ChatMessage = {
  id: string
  sequence: number | null
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
  body: string
}

export type ChatReadState = {
  user_id: string
  last_read_sequence: number | null
  updated_at: string
}
