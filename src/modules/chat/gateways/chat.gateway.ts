import type {
  ChatConversationSummary,
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
  setTyping: (isTyping: boolean) => Promise<void>
  unsubscribe: () => void
}

export type ChatInboxSubscriptionHandlers = {
  onChanged: () => void
  onMessage: (message: PersistedChatMessage) => void
}

export interface ChatGateway {
  getInbox: () => Promise<ChatConversationSummary[]>
  getLatestMessages: (
    conversationId: string,
    limit: number,
  ) => Promise<PersistedChatMessage[]>
  getMessagesBefore: (
    conversationId: string,
    sequence: number,
    limit: number,
  ) => Promise<PersistedChatMessage[]>
  createMessage: (
    input: CreateChatMessageInput,
  ) => Promise<PersistedChatMessage>
  getUnreadCount: () => Promise<number>
  getPeerReceipt: (conversationId: string) => Promise<ChatReceiptState>
  markDeliveredThrough: (sequence: number) => Promise<number>
  markReadThrough: (sequence: number) => Promise<number>
  subscribe: (
    userId: string,
    conversationId: string,
    handlers: ChatSubscriptionHandlers,
  ) => ChatLiveSession
  subscribeInbox: (
    userId: string,
    handlers: ChatInboxSubscriptionHandlers,
  ) => () => void
}
