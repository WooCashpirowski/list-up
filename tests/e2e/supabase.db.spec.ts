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

  expect(error, 'Supabase Auth should accept the configured credentials').toBeNull()
  expect(data.user?.email).toBe(testEmail)
  expect(data.session?.access_token).toBeTruthy()
}

test.describe('Supabase connection and RLS', () => {
  test.skip(!hasSupabaseConfig, 'Set the public Supabase variables')

  test('reaches PostgREST and rejects anonymous table access', async () => {
    const client = createTestClient()
    const { data, error } = await client.from('categories').select('id').limit(1)

    expect(data).toBeNull()
    expect(error, 'The anonymous role must not receive SELECT access').not.toBeNull()
    expect(error?.code).toBe('42501')
  })
})

test.describe('Supabase authenticated integration', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(
    !hasSupabaseConfig || !hasTestCredentials,
    'Set Supabase variables and allowlisted credentials in .env.test.local',
  )

  test('authenticates the allowlisted account and reads shared data', async () => {
    const client = createTestClient()

    try {
      await signIn(client)
      const { data, error } = await client.from('categories').select('id, name').limit(1)

      expect(error, 'RLS should admit the configured allowlisted account').toBeNull()
      expect(data?.length).toBeGreaterThan(0)
    } finally {
      await client.auth.signOut()
    }
  })

  test('performs relational CRUD and applies database triggers', async () => {
    const client = createTestClient()
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const listTitle = `Playwright DB list ${suffix}`
    const categoryName = `Playwright DB category ${suffix}`
    const itemName = `Playwright DB item ${suffix}`
    let listId: string | undefined
    let categoryId: string | undefined

    try {
      await signIn(client)

      const { data: list, error: listError } = await client
        .from('lists')
        .insert({ title: listTitle })
        .select('*')
        .single()
      expect(listError).toBeNull()
      expect(list?.created_by).toBeTruthy()
      expect(list?.list_type).toBe('shopping')
      listId = list?.id

      const { error: listTypeChangeError } = await client
        .from('lists')
        .update({ list_type: 'todo' })
        .eq('id', listId!)
      expect(
        listTypeChangeError,
        'A list type must be immutable after creation',
      ).not.toBeNull()

      const { data: category, error: categoryError } = await client
        .from('categories')
        .insert({ name: categoryName, order_index: 9999, keywords: ['probe'] })
        .select('*')
        .single()
      expect(categoryError).toBeNull()
      categoryId = category?.id

      expect(listId).toBeTruthy()
      expect(categoryId).toBeTruthy()

      const { data: item, error: itemError } = await client
        .from('list_items')
        .insert({
          list_id: listId!,
          category_id: categoryId!,
          name: itemName,
          quantity: '2',
        })
        .select('*')
        .single()
      expect(itemError).toBeNull()
      expect(item?.is_done).toBe(false)
      expect(item?.done_at).toBeNull()

      const { data: completed, error: completeError } = await client
        .from('list_items')
        .update({ is_done: true })
        .eq('id', item!.id)
        .select('*')
        .single()
      expect(completeError).toBeNull()
      expect(completed?.is_done).toBe(true)
      expect(completed?.done_at).toBeTruthy()

      const { data: renamed, error: renameError } = await client
        .from('lists')
        .update({ title: `${listTitle} updated` })
        .eq('id', listId!)
        .select('title')
        .single()
      expect(renameError).toBeNull()
      expect(renamed?.title).toBe(`${listTitle} updated`)

      const { error: deleteListError } = await client
        .from('lists')
        .delete()
        .eq('id', listId!)
      expect(deleteListError).toBeNull()
      listId = undefined

      const { data: cascadedItem, error: cascadeError } = await client
        .from('list_items')
        .select('id')
        .eq('id', item!.id)
      expect(cascadeError).toBeNull()
      expect(cascadedItem).toEqual([])

      const { error: deleteCategoryError } = await client
        .from('categories')
        .delete()
        .eq('id', categoryId!)
      expect(deleteCategoryError).toBeNull()
      categoryId = undefined
    } finally {
      if (listId) await client.from('lists').delete().eq('id', listId)
      if (categoryId) await client.from('categories').delete().eq('id', categoryId)
      await client.auth.signOut()
    }
  })
})
