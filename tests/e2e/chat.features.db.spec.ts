import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'

import type { Database } from '@/src/lib/supabase/database.types'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY
const accounts = [
  [process.env.E2E_TEST_EMAIL, process.env.E2E_TEST_PASSWORD],
  [process.env.E2E_SECOND_USER_EMAIL, process.env.E2E_SECOND_USER_PASSWORD],
  [process.env.E2E_THIRD_USER_EMAIL, process.env.E2E_THIRD_USER_PASSWORD],
] as const

test('isolates chat media, reactions, and personal aliases', async () => {
  test.skip(!url || !anonKey || !serviceKey || accounts.some(([email, password]) => !email || !password),
    'Requires three local users and service role')

  const clients = accounts.map(() => createClient<Database>(url!, anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  }))
  const admin = createClient<Database>(url!, serviceKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const users = await Promise.all(clients.map(async (client, index) => {
    const { data, error } = await client.auth.signInWithPassword({
      email: accounts[index][0]!, password: accounts[index][1]!,
    })
    expect(error).toBeNull()
    return data.user!
  }))
  const [first, second, third] = clients
  const [firstUser, secondUser] = users
  const { data: conversations } = await admin.from('chat_conversations').select('*')
  const conversationId = conversations?.find((conversation) =>
    [conversation.first_user_id, conversation.second_user_id].sort().join(':') ===
    [firstUser.id, secondUser.id].sort().join(':'),
  )?.id
  expect(conversationId).toBeTruthy()
  const messageId = crypto.randomUUID()
  const gifMessageId = crypto.randomUUID()
  const path = `${conversationId}/${firstUser.id}/${messageId}.jpg`
  const { data: previousAlias } = await admin.from('chat_peer_aliases')
    .select('alias').eq('owner_id', firstUser.id).eq('peer_id', secondUser.id)
    .maybeSingle()

  try {
    const { error: uploadError } = await first.storage.from('chat-photos')
      .upload(path, new Blob(['test image'], { type: 'image/jpeg' }),
        { contentType: 'image/jpeg' })
    expect(uploadError).toBeNull()
    expect((await second.storage.from('chat-photos').download(path)).error).toBeNull()
    expect((await third.storage.from('chat-photos').download(path)).error).not.toBeNull()
    expect((await third.storage.from('chat-photos').upload(
      `${conversationId}/${users[2].id}/${crypto.randomUUID()}.jpg`,
      new Blob(['intrusion'], { type: 'image/jpeg' }),
      { contentType: 'image/jpeg' },
    )).error).not.toBeNull()

    const { error: invalidError } = await first.from('chat_messages').insert({
      id: crypto.randomUUID(), conversation_id: conversationId!, body: 'caption',
      kind: 'photo', media_path: path,
    })
    expect(invalidError).not.toBeNull()
    expect((await first.from('chat_messages').insert({
      id: crypto.randomUUID(), conversation_id: conversationId!, body: '',
      kind: 'photo', media_path: `${conversationId}/${secondUser.id}/${crypto.randomUUID()}.jpg`,
    })).error).not.toBeNull()

    const { error: photoError } = await first.from('chat_messages').insert({
      id: messageId, conversation_id: conversationId!, body: '',
      kind: 'photo', media_path: path,
    })
    expect(photoError).toBeNull()
    expect((await third.rpc('set_chat_reaction', {
      target_message_id: messageId, selected_emoji: '👍',
    })).error).not.toBeNull()
    expect((await first.rpc('set_chat_reaction', {
      target_message_id: messageId, selected_emoji: '👍',
    })).error).not.toBeNull()
    expect((await second.rpc('set_chat_reaction', {
      target_message_id: messageId, selected_emoji: '👍',
    })).error).toBeNull()
    expect((await second.rpc('set_chat_reaction', {
      target_message_id: messageId, selected_emoji: '❤️',
    })).error).toBeNull()
    const { data: reactions } = await first.from('chat_message_reactions').select('emoji')
      .eq('message_id', messageId)
    expect(reactions).toEqual([{ emoji: '❤️' }])
    const { data: hiddenReactions } = await third.from('chat_message_reactions').select('emoji')
      .eq('message_id', messageId)
    expect(hiddenReactions).toEqual([])

    expect((await first.rpc('set_chat_peer_alias', {
      target_peer_id: secondUser.id, selected_alias: 'Private friend',
    })).error).toBeNull()
    const { data: firstInbox } = await first.rpc('get_chat_inbox')
    const { data: secondInbox } = await second.rpc('get_chat_inbox')
    expect(firstInbox?.find((item) => item.peer_id === secondUser.id)?.peer_alias).toBe('Private friend')
    expect(secondInbox?.find((item) => item.peer_id === firstUser.id)?.peer_alias).toBeNull()
    const { data: hiddenAliases } = await second.from('chat_peer_aliases').select('*')
      .eq('owner_id', firstUser.id)
    expect(hiddenAliases).toEqual([])

    const { error: gifError } = await first.from('chat_messages').insert({
      id: gifMessageId, conversation_id: conversationId!, body: '',
      kind: 'gif', gif_id: 'xT4uQulxzV39haRFjG',
    })
    expect(gifError).toBeNull()
    const { data: gifInbox } = await first.rpc('get_chat_inbox')
    expect(gifInbox?.find((item) => item.conversation_id === conversationId)?.last_message_kind)
      .toBe('gif')
    expect((await second.rpc('set_chat_reaction', {
      target_message_id: messageId, selected_emoji: null,
    })).error).toBeNull()
    expect((await first.from('chat_message_reactions').select('*').eq('message_id', messageId)).data)
      .toEqual([])
  } finally {
    await first.rpc('set_chat_peer_alias', {
      target_peer_id: secondUser.id, selected_alias: previousAlias?.alias ?? null,
    })
    await admin.from('notification_events').delete().in('source_id', [messageId, gifMessageId])
    await admin.from('chat_messages').delete().in('id', [messageId, gifMessageId])
    await admin.storage.from('chat-photos').remove([path])
    await Promise.all(clients.map((client) => client.auth.signOut()))
  }
})

test('uses the recipient’s private name and media previews in push deliveries', async () => {
  test.skip(process.env.E2E_ENVIRONMENT === 'staging',
    'Claims delivery rows only in the local Docker database')
  test.skip(!url || !anonKey || !serviceKey || accounts.slice(0, 2).some(([email, password]) => !email || !password),
    'Requires two local users and service role')

  const first = createClient<Database>(url!, anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const second = createClient<Database>(url!, anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const admin = createClient<Database>(url!, serviceKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const firstAuth = await first.auth.signInWithPassword({
    email: accounts[0][0]!, password: accounts[0][1]!,
  })
  const secondAuth = await second.auth.signInWithPassword({
    email: accounts[1][0]!, password: accounts[1][1]!,
  })
  expect(firstAuth.error).toBeNull()
  expect(secondAuth.error).toBeNull()
  const firstId = firstAuth.data.user!.id
  const secondId = secondAuth.data.user!.id
  const { data: conversations } = await admin.from('chat_conversations').select('*')
  const conversationId = conversations?.find((conversation) =>
    [conversation.first_user_id, conversation.second_user_id].sort().join(':') ===
    [firstId, secondId].sort().join(':'),
  )?.id
  expect(conversationId).toBeTruthy()
  const endpoint = `https://push.invalid/${crypto.randomUUID()}`
  const photoId = crypto.randomUUID()
  const gifId = crypto.randomUUID()
  const { data: previousAlias } = await admin.from('chat_peer_aliases')
    .select('alias').eq('owner_id', secondId).eq('peer_id', firstId)
    .maybeSingle()

  try {
    expect((await second.from('push_subscriptions').insert({
      endpoint, p256dh: 'test-p256dh', auth: 'test-auth',
    })).error).toBeNull()
    expect((await second.rpc('set_chat_peer_alias', {
      target_peer_id: firstId, selected_alias: 'My private contact',
    })).error).toBeNull()
    expect((await first.from('chat_messages').insert({
      id: photoId, conversation_id: conversationId!, body: '', kind: 'photo',
      media_path: `${conversationId}/${firstId}/${photoId}.jpg`,
    })).error).toBeNull()
    expect((await first.from('chat_messages').insert({
      id: gifId, conversation_id: conversationId!, body: '', kind: 'gif',
      gif_id: 'chatFeatureGif',
    })).error).toBeNull()

    const { data: claimed, error } = await admin.rpc('claim_notification_deliveries',
      { batch_size: 50 })
    expect(error).toBeNull()
    const previews = claimed?.filter((delivery) =>
      delivery.endpoint === endpoint && [photoId, gifId].includes(delivery.source_id))
    expect(previews?.map(({ sender_name, message_body }) => ({ sender_name, message_body })))
      .toEqual([
        { sender_name: 'My private contact', message_body: '📷 Photo' },
        { sender_name: 'My private contact', message_body: 'GIF' },
      ])
  } finally {
    await admin.from('notification_events').delete().in('source_id', [photoId, gifId])
    await admin.from('chat_messages').delete().in('id', [photoId, gifId])
    await admin.from('push_subscriptions').delete().eq('endpoint', endpoint)
    await second.rpc('set_chat_peer_alias', {
      target_peer_id: firstId, selected_alias: previousAlias?.alias ?? null,
    })
    await first.auth.signOut()
    await second.auth.signOut()
  }
})
