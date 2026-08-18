import type {
  ChatReadState,
  CreateChatMessageInput,
  PersistedChatMessage,
} from '../types/chat.types'

export type ChatSubscriptionHandlers = {
  onMessage: (message: PersistedChatMessage) => void
  onReadState: (state: ChatReadState) => void
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
  markReadThrough: (sequence: number) => Promise<number>
  subscribe: (
    userId: string,
    handlers: ChatSubscriptionHandlers,
  ) => () => void
}
