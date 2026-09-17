import type { Page, WebSocket } from '@playwright/test'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readChannelReply(payload: string): {
  event: string
  status: string
  topic: string
} | null {
  let frame: unknown

  try {
    frame = JSON.parse(payload)
  } catch {
    return null
  }

  if (Array.isArray(frame)) {
    const topic = frame[2]
    const event = frame[3]
    const response = frame[4]

    if (
      typeof topic === 'string' &&
      typeof event === 'string' &&
      isRecord(response) &&
      typeof response.status === 'string'
    ) {
      return { event, status: response.status, topic }
    }

    return null
  }

  if (!isRecord(frame) || !isRecord(frame.payload)) return null

  const { event, topic } = frame
  const status = frame.payload.status
  if (
    typeof event !== 'string' ||
    typeof topic !== 'string' ||
    typeof status !== 'string'
  ) {
    return null
  }

  return { event, status, topic }
}

export function waitForRealtimeSubscription(
  page: Page,
  channelPrefix: string,
  timeoutMs = 15_000,
  existingSockets: Iterable<WebSocket> = [],
): Promise<void> {
  return new Promise((resolve, reject) => {
    const expectedTopicPrefix = `realtime:${channelPrefix}`
    const inspectedSockets = new Set<WebSocket>()
    let settled = false

    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      page.off('websocket', inspectSocket)
      for (const socket of inspectedSockets) {
        socket.off('framereceived', inspectFrame)
      }
      if (error) reject(error)
      else resolve()
    }

    const inspectFrame = ({ payload }: { payload: string | Buffer }) => {
      const reply = readChannelReply(String(payload))
      if (
        !reply ||
        reply.event !== 'phx_reply' ||
        !reply.topic.startsWith(expectedTopicPrefix)
      ) {
        return
      }

      if (reply.status === 'ok') finish()
      else {
        finish(
          new Error(
            `Realtime rejected ${reply.topic} with status ${reply.status}`,
          ),
        )
      }
    }

    const inspectSocket = (socket: WebSocket) => {
      if (inspectedSockets.has(socket)) return
      inspectedSockets.add(socket)
      socket.on('framereceived', inspectFrame)
    }

    const timer = setTimeout(() => {
      finish(
        new Error(
          `Realtime channel ${expectedTopicPrefix} did not subscribe within ${timeoutMs}ms`,
        ),
      )
    }, timeoutMs)

    page.on('websocket', inspectSocket)
    for (const socket of existingSockets) inspectSocket(socket)
  })
}

// Attach before navigation/login so later channel joins on a shared socket
// remain observable without starting the subscription timeout too early.
export function observeRealtimeSubscriptions(page: Page) {
  const sockets = new Map<WebSocket, () => void>()
  const trackSocket = (socket: WebSocket) => {
    const forgetSocket = () => sockets.delete(socket)
    sockets.set(socket, forgetSocket)
    socket.once('close', forgetSocket)
  }
  page.on('websocket', trackSocket)

  return {
    waitForSubscription: (channelPrefix: string, timeoutMs = 15_000) =>
      waitForRealtimeSubscription(page, channelPrefix, timeoutMs, sockets.keys()),
    dispose: () => {
      page.off('websocket', trackSocket)
      for (const [socket, forgetSocket] of sockets) {
        socket.off('close', forgetSocket)
      }
      sockets.clear()
    },
  }
}
