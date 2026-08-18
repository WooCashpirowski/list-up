import type { ChatMessage } from '../types/chat.types'

export function sortChatMessages(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort((left, right) => {
    if (left.sequence !== null && right.sequence !== null) {
      return left.sequence - right.sequence
    }
    if (left.sequence === null && right.sequence !== null) return 1
    if (left.sequence !== null && right.sequence === null) return -1
    return (
      new Date(left.created_at).getTime() -
      new Date(right.created_at).getTime()
    )
  })
}

export function mergeChatMessages(
  current: ChatMessage[],
  incoming: ChatMessage[],
): ChatMessage[] {
  if (incoming.length === 0) return current

  const byId = new Map(current.map((message) => [message.id, message]))
  for (const message of incoming) byId.set(message.id, message)
  return sortChatMessages(Array.from(byId.values()))
}

export function getLatestIncomingSequence(
  messages: ChatMessage[],
  userId: string,
): number | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.sender_id !== userId && message.sequence !== null) {
      return message.sequence
    }
  }
  return null
}
