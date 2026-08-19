import type {
  ChatReadState,
  ChatReceiptEvent,
  ChatReceiptState,
  ChatTypingEvent,
  CreateChatMessageInput,
  PersistedChatMessage,
} from '../types/chat.types'

export type ChatSubscriptionHandlers = {
  onConnected: () => void
  onMessage: (message: PersistedChatMessage) => void
  onReadState: (state: ChatReadState) => void
  onReceipt: (receipt: ChatReceiptEvent) => void
  onTyping: (event: ChatTypingEvent) => void
}

export type ChatLiveSession = {
  publishReceipt: (receipt: Omit<ChatReceiptEvent, 'user_id'>) => Promise<void>
  setTyping: (isTyping: boolean) => Promise<void>
  unsubscribe: () => void
}

export interface ChatGateway {
  getLatestMessages: (limit: number) => Promise<PersistedChatMessage[]>
  getMessagesBefore: (
    sequence: number,
    limit: number,
  ) => Promise<PersistedChatMessage[]>
  createMessage: (
    input: CreateChatMessageInput,
  ) => Promise<PersistedChatMessage>
  getUnreadCount: () => Promise<number>
  getPeerReceipt: () => Promise<ChatReceiptState>
  markDeliveredThrough: (sequence: number) => Promise<number>
  markReadThrough: (sequence: number) => Promise<number>
  subscribe: (
    userId: string,
    handlers: ChatSubscriptionHandlers,
  ) => ChatLiveSession
}
