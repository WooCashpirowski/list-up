import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'

import type { Database } from '@/src/lib/supabase/database.types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceRoleKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY
const firstEmail = process.env.E2E_TEST_EMAIL
const firstPassword = process.env.E2E_TEST_PASSWORD
const secondEmail = process.env.E2E_SECOND_USER_EMAIL
const secondPassword = process.env.E2E_SECOND_USER_PASSWORD
const thirdEmail = process.env.E2E_THIRD_USER_EMAIL
const thirdPassword = process.env.E2E_THIRD_USER_PASSWORD

const hasChatTestConfig = Boolean(
  supabaseUrl &&
    anonKey &&
    serviceRoleKey &&
    firstEmail &&
    firstPassword &&
    secondEmail &&
    secondPassword &&
    thirdEmail &&
    thirdPassword,
)

function client(key: string): SupabaseClient<Database> {
  return createClient<Database>(supabaseUrl!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function signIn(
  supabase: SupabaseClient<Database>,
  email: string,
  password: string,
) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  expect(error).toBeNull()
  expect(data.user).toBeTruthy()
  return data.user!
}

test.describe('chat database security and read cursors', () => {
  test.skip(!hasChatTestConfig, 'Set three app users and a test service role')

  test('preserves push subscription ownership during service-role bookkeeping', async () => {
    const userClient = client(anonKey!)
    const admin = client(serviceRoleKey!)
    const endpoint = `https://push.invalid/${crypto.randomUUID()}`

    try {
      const user = await signIn(userClient, secondEmail!, secondPassword!)
      const { data: subscription, error: insertError } = await userClient
        .from('push_subscriptions')
        .insert({ endpoint, p256dh: 'test-p256dh', auth: 'test-auth' })
        .select('id, user_id')
        .single()
      expect(insertError).toBeNull()
      expect(subscription?.user_id).toBe(user.id)

      const successAt = new Date().toISOString()
      const { data: updated, error: updateError } = await admin
        .from('push_subscriptions')
        .update({ last_success_at: successAt, is_active: true })
        .eq('id', subscription!.id)
        .select('user_id, last_success_at')
        .single()

      expect(updateError).toBeNull()
      expect(updated?.user_id).toBe(user.id)
      expect(new Date(updated!.last_success_at!).toISOString()).toBe(successAt)
    } finally {
      await admin.from('push_subscriptions').delete().eq('endpoint', endpoint)
      await userClient.auth.signOut()
    }
  })

  test('creates an immutable message, notifies only its recipient, and advances unread state', async () => {
    const first = client(anonKey!)
    const second = client(anonKey!)
    const third = client(anonKey!)
    const admin = client(serviceRoleKey!)
    const id = crypto.randomUUID()
    const secondMessageId = crypto.randomUUID()
    const endpoint = `https://push.invalid/${crypto.randomUUID()}`
    let firstUserId: string | undefined
    let secondUserId: string | undefined
    let thirdUserId: string | undefined
    let conversationId: string | undefined
    let previousReadState:
      | Database['public']['Tables']['chat_read_state']['Row']
      | null = null

    try {
      firstUserId = (await signIn(first, firstEmail!, firstPassword!)).id
      secondUserId = (await signIn(second, secondEmail!, secondPassword!)).id
      thirdUserId = (await signIn(third, thirdEmail!, thirdPassword!)).id
      const { data: conversations, error: conversationsError } = await admin
        .from('chat_conversations')
        .select('*')
      expect(conversationsError).toBeNull()
      conversationId = conversations?.find(
        (conversation) =>
          [conversation.first_user_id, conversation.second_user_id]
            .sort()
            .join(':') === [firstUserId, secondUserId].sort().join(':'),
      )?.id
      expect(conversationId).toBeTruthy()

      const { data: sharedCategories, error: sharedCategoriesError } = await third
        .from('categories')
        .select('id')
        .limit(1)
      expect(sharedCategoriesError).toBeNull()
      expect(sharedCategories).not.toBeNull()

      const { data: hiddenConversation, error: hiddenConversationError } =
        await third
          .from('chat_conversations')
          .select('id')
          .eq('id', conversationId!)
      expect(hiddenConversationError).toBeNull()
      expect(hiddenConversation).toEqual([])

      const { data: thirdInbox, error: thirdInboxError } = await third.rpc(
        'get_chat_inbox',
      )
      expect(thirdInboxError).toBeNull()
      expect(thirdInbox?.map(({ peer_id }) => peer_id)).toEqual(
        expect.arrayContaining([firstUserId!, secondUserId!]),
      )

      const { data: savedReadState } = await admin
        .from('chat_read_state')
        .select('*')
        .eq('conversation_id', conversationId!)
        .eq('user_id', secondUserId)
        .maybeSingle()
      previousReadState = savedReadState

      const anonymous = client(anonKey!)
      const { error: anonymousError } = await anonymous
        .from('chat_messages')
        .select('id')
        .limit(1)
      expect(anonymousError).not.toBeNull()

      const { error: subscriptionError } = await second
        .from('push_subscriptions')
        .insert({ endpoint, p256dh: 'test-p256dh', auth: 'test-auth' })
      expect(subscriptionError).toBeNull()

      const { data: inserted, error: insertError } = await first
        .from('chat_messages')
        .insert({
          id,
          conversation_id: conversationId!,
          body: 'Playwright secure chat message',
          sender_id: secondUserId,
        })
        .select('*')
        .single()
      expect(insertError).toBeNull()
      expect(inserted?.sender_id).toBe(firstUserId)
      expect(inserted?.sequence).toBeGreaterThan(0)

      const { data: secondMessage, error: secondInsertError } = await first
        .from('chat_messages')
        .insert({
          id: secondMessageId,
          conversation_id: conversationId!,
          body: 'Second ordered message',
        })
        .select('*')
        .single()
      expect(secondInsertError).toBeNull()
      expect(secondMessage!.sequence).toBeGreaterThan(inserted!.sequence)

      const { data: leakedMessages, error: leakedMessagesError } = await third
        .from('chat_messages')
        .select('id')
        .eq('conversation_id', conversationId!)
      expect(leakedMessagesError).toBeNull()
      expect(leakedMessages).toEqual([])

      const forgedInsert = await third.from('chat_messages').insert({
        id: crypto.randomUUID(),
        conversation_id: conversationId!,
        body: 'This must be rejected',
      })
      expect(forgedInsert.error).not.toBeNull()

      const { data: ordered } = await first
        .from('chat_messages')
        .select('id, sequence')
        .in('id', [id, secondMessageId])
        .order('sequence', { ascending: true })
      expect(ordered?.map(({ id: messageId }) => messageId)).toEqual([
        id,
        secondMessageId,
      ])

      const { error: emptyBodyError } = await first
        .from('chat_messages')
        .insert({
          id: crypto.randomUUID(),
          conversation_id: conversationId!,
          body: '   ',
        })
      expect(emptyBodyError).not.toBeNull()
      const { error: longBodyError } = await first
        .from('chat_messages')
        .insert({
          id: crypto.randomUUID(),
          conversation_id: conversationId!,
          body: 'x'.repeat(2001),
        })
      expect(longBodyError).not.toBeNull()

      const { error: updateError } = await first
        .from('chat_messages')
        .update({ body: 'tampered' })
        .eq('id', id)
      expect(updateError).not.toBeNull()

      const { error: deleteError } = await first
        .from('chat_messages')
        .delete()
        .eq('id', id)
      expect(deleteError).not.toBeNull()

      const { data: unreadBefore } = await second.rpc('get_chat_unread_count')
      expect(Number(unreadBefore)).toBeGreaterThan(0)

      const { data: deliveredSequence, error: deliveryError } = await second.rpc(
        'mark_chat_delivered',
        { message_sequence: inserted!.sequence },
      )
      expect(deliveryError).toBeNull()
      expect(Number(deliveredSequence)).toBe(inserted!.sequence)

      const ownDelivery = await first.rpc('mark_chat_delivered', {
        message_sequence: inserted!.sequence,
      })
      expect(ownDelivery.error).not.toBeNull()

      const { data: deliveredReceipt, error: deliveredReceiptError } =
        await first.rpc('get_chat_peer_receipt', {
          target_conversation_id: conversationId!,
        })
      expect(deliveredReceiptError).toBeNull()
      expect(deliveredReceipt).toEqual([
        {
          last_delivered_sequence: inserted!.sequence,
          last_read_sequence: previousReadState?.last_read_sequence ?? null,
        },
      ])

      const { data: unreadAfter, error: readError } = await second.rpc(
        'mark_chat_read',
        { message_sequence: secondMessage!.sequence },
      )
      expect(readError).toBeNull()
      expect(Number(unreadAfter)).toBe(0)

      await second.rpc('mark_chat_read', { message_sequence: inserted!.sequence })
      const { data: readState } = await second
        .from('chat_read_state')
        .select('last_delivered_sequence, last_read_sequence')
        .eq('conversation_id', conversationId!)
        .single()
      expect(readState?.last_read_sequence).toBe(secondMessage!.sequence)
      expect(readState?.last_delivered_sequence).toBe(secondMessage!.sequence)

      const { data: readReceipt } = await first.rpc('get_chat_peer_receipt', {
        target_conversation_id: conversationId!,
      })
      expect(readReceipt).toEqual([
        {
          last_delivered_sequence: secondMessage!.sequence,
          last_read_sequence: secondMessage!.sequence,
        },
      ])

      const { data: monotonicDelivery } = await second.rpc(
        'mark_chat_delivered',
        { message_sequence: inserted!.sequence },
      )
      expect(Number(monotonicDelivery)).toBe(secondMessage!.sequence)

      const { data: privateReadState } = await first
        .from('chat_read_state')
        .select('user_id')
        .eq('conversation_id', conversationId!)
        .eq('user_id', secondUserId)
      expect(privateReadState).toEqual([])

      const anonymousReceipt = await client(anonKey!).rpc(
        'get_chat_peer_receipt',
        { target_conversation_id: conversationId! },
      )
      expect(anonymousReceipt.error).not.toBeNull()

      const { data: events, error: eventError } = await admin
        .from('notification_events')
        .select('recipient_id, actor_id, source_id')
        .eq('source_id', id)
      expect(eventError).toBeNull()
      expect(events).toEqual([
        { recipient_id: secondUserId, actor_id: firstUserId, source_id: id },
      ])
      expect(events?.some(({ recipient_id }) => recipient_id === thirdUserId)).toBe(
        false,
      )

      const { data: leakedSubscription } = await first
        .from('push_subscriptions')
        .select('endpoint')
        .eq('endpoint', endpoint)
      expect(leakedSubscription).toEqual([])
    } finally {
      await admin
        .from('notification_events')
        .delete()
        .in('source_id', [id, secondMessageId])
      if (secondUserId) {
        await admin
          .from('chat_read_state')
          .delete()
          .eq('conversation_id', conversationId!)
          .eq('user_id', secondUserId)
      }
      await admin.from('chat_messages').delete().in('id', [id, secondMessageId])
      if (previousReadState) {
        await admin.from('chat_read_state').insert(previousReadState)
      }
      await admin.from('push_subscriptions').delete().eq('endpoint', endpoint)
      await first.auth.signOut()
      await second.auth.signOut()
      await third.auth.signOut()
    }
  })
})
