import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'

import type { Database } from '@/src/lib/supabase/database.types'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY
const firstEmail = process.env.E2E_TEST_EMAIL
const firstPassword = process.env.E2E_TEST_PASSWORD
const secondEmail = process.env.E2E_SECOND_USER_EMAIL
const secondPassword = process.env.E2E_SECOND_USER_PASSWORD

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'My Lists' })).toBeVisible()
}

async function openChat(page: Page, peerEmail: string) {
  await page.getByRole('button', { name: 'Chat', exact: true }).click()
  await page.getByRole('button').filter({ hasText: peerEmail }).click()
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible()
}

test('sends a queued photo and GIF, links URLs, reacts, and keeps a personal name private', async ({ browser }) => {
  test.skip(!url || !serviceKey || !firstEmail || !firstPassword || !secondEmail || !secondPassword,
    'Requires two local app users and service role')
  const firstContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const secondContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const otherDeviceContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const first = await firstContext.newPage()
  const second = await secondContext.newPage()
  const otherDevice = await otherDeviceContext.newPage()
  const admin = createClient<Database>(url!, serviceKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const marker = `Chat features ${crypto.randomUUID()}`
  const startedAt = new Date().toISOString()
  const alias = `Friend ${Date.now()}`
  const { data: profiles } = await admin.from('profiles').select('id,email')
    .in('email', [firstEmail!, secondEmail!])
  const firstId = profiles?.find((profile) => profile.email === firstEmail)?.id
  const secondId = profiles?.find((profile) => profile.email === secondEmail)?.id
  const { data: conversations } = await admin.from('chat_conversations').select('*')
  const conversationId = conversations?.find((conversation) =>
    [conversation.first_user_id, conversation.second_user_id].sort().join(':') ===
    [firstId, secondId].sort().join(':'),
  )?.id
  expect(conversationId).toBeTruthy()
  const { data: previousReadStates } = await admin.from('chat_read_state').select('*')
    .eq('conversation_id', conversationId!)
  const { data: previousAlias } = await admin.from('chat_peer_aliases')
    .select('alias').eq('owner_id', firstId!).eq('peer_id', secondId!)
    .maybeSingle()

  const gif = {
    id: 'chatFeatureGif', title: 'Happy cat',
    images: { fixed_width: { url: 'https://media.giphy.com/media/chatFeatureGif/giphy.gif', width: '100', height: '100' } },
    analytics: {},
  }
  try {
    for (const page of [first, second]) {
      await page.route('https://api.giphy.com/v1/gifs**', async (route) => {
        await route.fulfill({ json: { data: [gif], pagination: { count: 1 }, meta: { status: 200 } } })
      })
      await page.route('https://media.giphy.com/**', async (route) => {
        await route.fulfill({ contentType: 'image/gif',
          body: Buffer.from('R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=', 'base64') })
      })
    }
    await Promise.all([
      signIn(first, firstEmail!, firstPassword!),
      signIn(second, secondEmail!, secondPassword!),
      signIn(otherDevice, firstEmail!, firstPassword!),
    ])
    await Promise.all([
      openChat(first, secondEmail!), openChat(second, firstEmail!),
      openChat(otherDevice, secondEmail!),
    ])

    await first.getByRole('button', { name: 'Chat settings' }).click()
    await first.getByLabel('Name for this person').fill(alias)
    await first.getByRole('button', { name: 'Save name' }).first().click()
    await expect(first.getByRole('heading', { name: alias })).toBeVisible()
    await expect(otherDevice.getByRole('heading', { name: alias })).toBeVisible()
    await expect(second.getByRole('heading', { name: alias })).toHaveCount(0)
    await first.getByRole('dialog', { name: 'Chat settings' })
      .getByRole('button', { name: 'Cancel' }).click()

    await first.getByRole('textbox', { name: 'Message' })
      .fill(`${marker} https://example.com/path?x=1 example.org javascript:bad.example`)
    await first.getByRole('button', { name: 'Send message' }).click()
    const textBubble = second.locator('article').filter({ hasText: marker })
    await expect(textBubble).toBeVisible()
    await expect(textBubble.getByRole('link', { name: 'https://example.com/path?x=1' }))
      .toHaveAttribute('href', 'https://example.com/path?x=1')
    await expect(textBubble.getByRole('link', { name: 'example.org' }))
      .toHaveAttribute('href', 'https://example.org')
    await expect(textBubble.getByRole('link', { name: /bad\.example/ })).toHaveCount(0)

    await textBubble.dispatchEvent('pointerdown', { pointerType: 'touch', clientX: 100, clientY: 100 })
    await expect(second.getByRole('dialog', { name: 'Choose reaction' })).toBeVisible()
    await second.getByRole('dialog', { name: 'Choose reaction' })
      .getByRole('button', { name: '❤️' }).click()
    await expect(first.locator('article').filter({ hasText: marker }).getByText('❤️')).toBeVisible()
    await secondContext.setOffline(true)
    await textBubble.getByRole('button', { name: 'Choose reaction: ❤️' }).click()
    await secondContext.setOffline(false)
    await expect(first.locator('article').filter({ hasText: marker }).getByText('❤️')).toHaveCount(0)

    await first.getByRole('button', { name: 'GIFs' }).click()
    await first.getByPlaceholder('Search GIFs…').fill('cat')
    await expect(first.getByRole('button', { name: 'Happy cat' })).toBeVisible()
    await firstContext.setOffline(true)
    await first.getByRole('button', { name: 'Happy cat' }).click()
    await expect(first.getByLabel('Queued').last()).toBeVisible()
    await firstContext.setOffline(false)
    await expect(second.locator('article img[alt="Powered by GIPHY"]:visible').last()).toBeVisible()

    await firstContext.setOffline(true)
    await first.getByRole('button', { name: 'Add photo' }).click()
    await expect(first.getByRole('button', { name: 'Take photo' })).toBeVisible()
    await expect(first.getByRole('button', { name: 'Choose from photos' })).toBeVisible()
    await first.locator('input[accept="image/*,.heic,.heif"]').setInputFiles({
      name: 'small.png', mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLytQAAAABJRU5ErkJggg==', 'base64'),
    })
    await expect(first.getByRole('dialog', { name: 'Preview photo' })).toBeVisible()
    await first.getByRole('button', { name: 'Send photo' }).click()
    await expect(first.getByLabel('Queued').last()).toBeVisible()
    await firstContext.setOffline(false)
    await expect(second.locator('article').filter({ has: second.getByRole('img', { name: 'Photo' }) }).last())
      .toBeVisible({ timeout: 20_000 })

    let abortedPhotoInsert = false
    await first.route('**/rest/v1/chat_messages**', async (route) => {
      if (!abortedPhotoInsert && route.request().method() === 'POST' &&
        route.request().postData()?.includes('"kind":"photo"')) {
        abortedPhotoInsert = true
        await route.abort('failed')
      } else await route.continue()
    })
    await first.locator('input[accept="image/*,.heic,.heif"]').setInputFiles({
      name: 'retry.png', mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLytQAAAABJRU5ErkJggg==', 'base64'),
    })
    await first.getByRole('button', { name: 'Send photo' }).click()
    await expect(first.getByRole('button', { name: 'Retry' }).last()).toBeVisible()
    await first.getByRole('button', { name: 'Retry' }).last().click()
    await expect(second.getByRole('img', { name: 'Photo' })).toHaveCount(2, { timeout: 20_000 })
  } finally {
    if (previousAlias) await admin.from('chat_peer_aliases').upsert({
      owner_id: firstId!, peer_id: secondId!, alias: previousAlias.alias,
    })
    else await admin.from('chat_peer_aliases').delete().eq('owner_id', firstId!).eq('peer_id', secondId!)
    const { data: created } = await admin.from('chat_messages').select('id,media_path')
      .eq('conversation_id', conversationId!).gte('created_at', startedAt)
    const ids = created?.map((message) => message.id) ?? []
    if (ids.length) {
      await admin.from('notification_events').delete().in('source_id', ids)
      await admin.from('chat_read_state').delete().eq('conversation_id', conversationId!)
      await admin.from('chat_messages').delete().in('id', ids)
      if (previousReadStates?.length) await admin.from('chat_read_state').insert(previousReadStates)
      const paths = created?.map((message) => message.media_path).filter((path): path is string => Boolean(path)) ?? []
      if (paths.length) await admin.storage.from('chat-photos').remove(paths)
    }
    await firstContext.close()
    await secondContext.close()
    await otherDeviceContext.close()
  }
})
