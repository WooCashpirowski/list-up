import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'

import type { Database } from '@/src/lib/supabase/database.types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const testEmail = process.env.E2E_TEST_EMAIL
const testPassword = process.env.E2E_TEST_PASSWORD

const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey)
const hasTestCredentials = Boolean(testEmail && testPassword)

function createTestClient(): SupabaseClient<Database> {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }

  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  })
}

async function signIn(client: SupabaseClient<Database>) {
  if (!testEmail || !testPassword) {
    throw new Error('Missing E2E_TEST_EMAIL or E2E_TEST_PASSWORD')
  }

  const { data, error } = await client.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  })

  expect(error, 'Supabase Auth should accept the test credentials').toBeNull()
  expect(data.user?.email).toBe(testEmail)
  expect(data.session?.access_token).toBeTruthy()

  return data
}

test.describe('Supabase connection', () => {
  test.skip(
    !hasSupabaseConfig,
    'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY',
  )

  test('reaches PostgREST and rejects anonymous table access', async () => {
    const client = createTestClient()
    const { data, error } = await client
      .from('categories')
      .select('id')
      .limit(1)

    expect(data).toBeNull()
    expect(error, 'The anonymous role must not receive SELECT access').not.toBeNull()
    expect(error?.code).toBe('42501')
  })
})

test.describe('Supabase authenticated integration', () => {
  test.skip(
    !hasSupabaseConfig || !hasTestCredentials,
    'Set Supabase variables and E2E test credentials in .env.test.local',
  )

  test('authenticates and verifies the RLS result for the configured account', async () => {
    const client = createTestClient()

    try {
      await signIn(client)

      const { data, error } = await client
        .from('categories')
        .select('id, name')
        .limit(1)

      expect(error, 'The PostgREST request should reach the database').toBeNull()

      const allowedEmails = (process.env.NEXT_PUBLIC_ALLOWED_EMAILS ?? '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
      const shouldHaveDatabaseAccess = allowedEmails.includes(
        testEmail!.toLowerCase(),
      )

      if (shouldHaveDatabaseAccess) {
        expect(data?.length).toBeGreaterThan(0)
      } else {
        expect(data).toEqual([])

        const { error: insertError } = await client
          .from('lists')
          .insert({ title: `RLS probe ${Date.now()}` })

        expect(insertError, 'RLS should reject a non-allowlisted account').not.toBeNull()
        expect(insertError?.code).toBe('42501')
      }
    } finally {
      await client.auth.signOut()
    }
  })

  test('creates, reads, updates, and deletes a list', async () => {
    test.skip(
      process.env.E2E_DB_CRUD !== 'true',
      'Set E2E_DB_CRUD=true only for an account included in the RLS allowlist',
    )

    const client = createTestClient()
    const originalTitle = `Playwright DB list ${Date.now()}`
    const updatedTitle = `${originalTitle} updated`
    let createdListId: string | undefined

    try {
      await signIn(client)

      const { data: created, error: createError } = await client
        .from('lists')
        .insert({ title: originalTitle })
        .select('*')
        .single()

      expect(createError).toBeNull()
      expect(created?.title).toBe(originalTitle)
      createdListId = created?.id

      expect(createdListId).toBeTruthy()

      const { data: read, error: readError } = await client
        .from('lists')
        .select('*')
        .eq('id', createdListId!)
        .single()

      expect(readError).toBeNull()
      expect(read?.title).toBe(originalTitle)

      const { data: updated, error: updateError } = await client
        .from('lists')
        .update({ title: updatedTitle })
        .eq('id', createdListId!)
        .select('*')
        .single()

      expect(updateError).toBeNull()
      expect(updated?.title).toBe(updatedTitle)

      const { error: deleteError } = await client
        .from('lists')
        .delete()
        .eq('id', createdListId!)

      expect(deleteError).toBeNull()
      createdListId = undefined
    } finally {
      if (createdListId) {
        await client.from('lists').delete().eq('id', createdListId)
      }
      await client.auth.signOut()
    }
  })
})
