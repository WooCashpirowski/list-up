import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'

import type { Database } from '@/src/lib/supabase/database.types'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceRoleKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY
const firstEmail = process.env.E2E_TEST_EMAIL
const firstPassword = process.env.E2E_TEST_PASSWORD
const secondEmail = process.env.E2E_SECOND_USER_EMAIL
const secondPassword = process.env.E2E_SECOND_USER_PASSWORD

const hasConfig = Boolean(
  url &&
    anonKey &&
    serviceRoleKey &&
    firstEmail &&
    firstPassword &&
    secondEmail &&
    secondPassword,
)

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'My Lists' })).toBeVisible()
}

test('delivers chat messages in realtime, tracks unread, and syncs an offline send', async ({
  browser,
}) => {
  test.skip(!hasConfig, 'Set both allowlisted users and the test service role')

  const firstContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const secondContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const firstPage = await firstContext.newPage()
  const secondPage = await secondContext.newPage()
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const onlineMessage = `Realtime chat ${suffix}`
  const offlineMessage = `Offline chat ${suffix}`
  const admin = createClient<Database>(url!, serviceRoleKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  let secondUserId: string | null = null
  let previousReadState:
    | Database['public']['Tables']['chat_read_state']['Row']
    | null = null

  try {
    await Promise.all([
      signIn(firstPage, firstEmail!, firstPassword!),
      signIn(secondPage, secondEmail!, secondPassword!),
    ])
    const { data: secondProfile } = await admin
      .from('profiles')
      .select('id')
      .ilike('email', secondEmail!)
      .single()
    secondUserId = secondProfile!.id
    const { data: savedReadState } = await admin
      .from('chat_read_state')
      .select('*')
      .eq('user_id', secondUserId)
      .maybeSingle()
    previousReadState = savedReadState

    await firstPage.getByRole('button', { name: 'Chat', exact: true }).click()
    await expect(firstPage.getByRole('heading', { name: 'Chat' })).toBeVisible()
    await firstPage.getByLabel('Message').fill(onlineMessage)
    await firstPage.getByRole('button', { name: 'Send message' }).click()
    await expect(firstPage.getByText(onlineMessage, { exact: true })).toBeVisible()

    await expect(
      secondPage.getByLabel(/unread chat messages/),
    ).toBeVisible()
    await secondPage.getByRole('button', { name: /Chat/ }).click()
    await expect(secondPage.getByText(onlineMessage, { exact: true })).toBeVisible()
    await expect(secondPage.getByLabel(/unread chat messages/)).toHaveCount(0)

    await firstContext.setOffline(true)
    await firstPage.getByLabel('Message').fill(offlineMessage)
    await firstPage.getByRole('button', { name: 'Send message' }).click()
    await expect(firstPage.getByText(offlineMessage, { exact: true })).toBeVisible()
    await expect(firstPage.getByLabel('queued')).toBeVisible()

    await firstContext.setOffline(false)
    await expect(secondPage.getByText(offlineMessage, { exact: true })).toBeVisible()
  } finally {
    const { data: messages } = await admin
      .from('chat_messages')
      .select('id')
      .in('body', [onlineMessage, offlineMessage])
    const ids = messages?.map(({ id }) => id) ?? []
    if (ids.length > 0) {
      await admin.from('notification_events').delete().in('source_id', ids)
      if (secondUserId) {
        await admin.from('chat_read_state').delete().eq('user_id', secondUserId)
      }
      await admin.from('chat_messages').delete().in('id', ids)
      if (previousReadState) {
        await admin.from('chat_read_state').insert(previousReadState)
      }
    }
    await firstContext.close()
    await secondContext.close()
  }
})
