export type ChatUnreadAction =
  | { type: 'replace'; count: number }
  | { type: 'incoming' }
  | { type: 'read'; remaining: number }

export function reduceChatUnreadCount(
  current: number,
  action: ChatUnreadAction,
): number {
  if (action.type === 'incoming') return current + 1
  const next = action.type === 'replace' ? action.count : action.remaining
  return Math.max(0, Math.trunc(next))
}
