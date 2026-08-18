import { createHash, timingSafeEqual } from 'node:crypto'

import { dispatchPendingNotifications } from '@/src/modules/notification-dispatch'

export const runtime = 'nodejs'
export const maxDuration = 30

function secretsMatch(received: string | null, expected: string): boolean {
  if (!received) return false
  const receivedHash = createHash('sha256').update(received).digest()
  const expectedHash = createHash('sha256').update(expected).digest()
  return timingSafeEqual(receivedHash, expectedHash)
}

export async function POST(request: Request): Promise<Response> {
  const expectedSecret = process.env.NOTIFICATION_WEBHOOK_SECRET
  if (
    !expectedSecret ||
    !secretsMatch(request.headers.get('x-notification-secret'), expectedSecret)
  ) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const summary = await dispatchPendingNotifications()
    return Response.json(summary, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch {
    return Response.json(
      { error: 'Notification dispatch failed' },
      { status: 500 },
    )
  }
}
