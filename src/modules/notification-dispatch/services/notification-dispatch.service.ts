import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import webPush from 'web-push'

import type { Database } from '@/src/lib/supabase/database.types'

import { decidePushFailure } from '../model/delivery-retry'
import { createNotificationPreview } from '../model/notification-preview'

type ClaimedDelivery =
  Database['public']['Functions']['claim_notification_deliveries']['Returns'][number]

type DispatchSummary = {
  claimed: number
  sent: number
  retried: number
  dead: number
}

const DELIVERY_CONCURRENCY = 10

function createAdminClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !secret) throw new Error('Missing Supabase server credentials')

  return createClient<Database>(url, secret, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!publicKey || !privateKey || !subject) {
    throw new Error('Missing VAPID configuration')
  }

  webPush.setVapidDetails(subject, publicKey, privateKey)
}

function getStatusCode(error: unknown): number | null {
  if (
    error !== null &&
    typeof error === 'object' &&
    'statusCode' in error &&
    typeof error.statusCode === 'number'
  ) {
    return error.statusCode
  }
  return null
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 500)
  return 'Unknown Web Push delivery error'
}

async function updateDelivery(
  client: SupabaseClient<Database>,
  deliveryId: string,
  update: Database['public']['Tables']['notification_deliveries']['Update'],
) {
  await client
    .from('notification_deliveries')
    .update(update)
    .eq('id', deliveryId)
    .throwOnError()
}

async function deliver(
  client: SupabaseClient<Database>,
  delivery: ClaimedDelivery,
): Promise<'sent' | 'retried' | 'dead'> {
  if (
    delivery.event_type !== 'chat.message_created' ||
    !delivery.message_body
  ) {
    await updateDelivery(client, delivery.delivery_id, {
      status: 'dead',
      lease_until: null,
      last_error: `Unsupported notification event: ${delivery.event_type}`,
    })
    return 'dead'
  }

  const payload = JSON.stringify({
    title: delivery.sender_name,
    body: createNotificationPreview(delivery.message_body),
    tag: 'list-up-chat',
    url: '/?view=chat',
  })

  try {
    const response = await webPush.sendNotification(
      {
        endpoint: delivery.endpoint,
        keys: {
          p256dh: delivery.p256dh,
          auth: delivery.auth,
        },
      },
      payload,
      {
        TTL: 86_400,
        urgency: 'high',
      },
    )

    const now = new Date().toISOString()
    await Promise.all([
      updateDelivery(client, delivery.delivery_id, {
        status: 'sent',
        sent_at: now,
        lease_until: null,
        last_status_code: response.statusCode,
        last_error: null,
      }),
      client
        .from('push_subscriptions')
        .update({ last_success_at: now, is_active: true })
        .eq('id', delivery.subscription_id)
        .throwOnError(),
    ])
    return 'sent'
  } catch (error) {
    const statusCode = getStatusCode(error)
    const decision = decidePushFailure(statusCode, delivery.attempt_number)

    if (decision.deactivateSubscription) {
      await Promise.all([
        client
          .from('push_subscriptions')
          .update({ is_active: false })
          .eq('id', delivery.subscription_id)
          .throwOnError(),
        client
          .from('notification_deliveries')
          .update({
            status: 'dead',
            lease_until: null,
            last_status_code: statusCode,
            last_error: 'Push subscription expired',
          })
          .eq('subscription_id', delivery.subscription_id)
          .in('status', ['pending', 'retry', 'processing'])
          .throwOnError(),
      ])
    }

    await updateDelivery(client, delivery.delivery_id, {
      status: decision.status,
      next_attempt_at: decision.retryAfterSeconds
        ? new Date(
            Date.now() + decision.retryAfterSeconds * 1000,
          ).toISOString()
        : new Date().toISOString(),
      lease_until: null,
      last_status_code: statusCode,
      last_error: getErrorMessage(error),
    })

    return decision.status === 'retry' ? 'retried' : 'dead'
  }
}

export async function dispatchPendingNotifications(): Promise<DispatchSummary> {
  configureWebPush()
  const client = createAdminClient()
  const { data } = await client
    .rpc('claim_notification_deliveries', { batch_size: 50 })
    .throwOnError()
  const deliveries = data ?? []
  const results: Array<'sent' | 'retried' | 'dead'> = []

  for (let offset = 0; offset < deliveries.length; offset += DELIVERY_CONCURRENCY) {
    const batch = deliveries.slice(offset, offset + DELIVERY_CONCURRENCY)
    results.push(...(await Promise.all(batch.map((delivery) => deliver(client, delivery)))))
  }

  return {
    claimed: deliveries.length,
    sent: results.filter((result) => result === 'sent').length,
    retried: results.filter((result) => result === 'retried').length,
    dead: results.filter((result) => result === 'dead').length,
  }
}
