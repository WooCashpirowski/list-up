import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, test, type Locator, type Page } from '@playwright/test'

import type { Database } from '@/src/lib/supabase/database.types'

import { waitForRealtimeSubscription } from './realtime'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const testEmail = process.env.E2E_TEST_EMAIL
const testPassword = process.env.E2E_TEST_PASSWORD
const hasTestConfig = Boolean(
  supabaseUrl && supabaseAnonKey && testEmail && testPassword,
)

function createTestClient(): SupabaseClient<Database> {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase URL or anonymous key')
  }

  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  })
}

async function signInViaUi(page: Page) {
  if (!testEmail || !testPassword) {
    throw new Error('Missing E2E test credentials')
  }

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Welcome to List Up!' })).toBeVisible()
  await page.getByLabel('Email').fill(testEmail)
  await page.getByLabel('Password').fill(testPassword)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'My Lists' })).toBeVisible()
}

async function expectDatabaseCount(
  client: SupabaseClient<Database>,
  table: 'lists' | 'categories' | 'list_items',
  value: string,
  expectedCount: number,
) {
  await expect
    .poll(async () => {
      if (table === 'lists') {
        const { count, error } = await client
          .from('lists')
          .select('id', { count: 'exact', head: true })
          .eq('title', value)
        expect(error).toBeNull()
        return count
      }

      if (table === 'categories') {
        const { count, error } = await client
          .from('categories')
          .select('id', { count: 'exact', head: true })
          .eq('name', value)
        expect(error).toBeNull()
        return count
      }

      const { count, error } = await client
        .from('list_items')
        .select('id', { count: 'exact', head: true })
        .eq('name', value)

      expect(error).toBeNull()
      return count
    })
    .toBe(expectedCount)
}

async function getOutboxCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const request = indexedDB.open('list-up-offline', 1)
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const database = request.result
          const transaction = database.transaction('outbox', 'readonly')
          const countRequest = transaction.objectStore('outbox').count()
          countRequest.onerror = () => reject(countRequest.error)
          countRequest.onsuccess = () => resolve(countRequest.result)
          transaction.oncomplete = () => database.close()
        }
      }),
  )
}

async function dragAcross(
  page: Page,
  target: Locator,
  horizontalRatio: number,
  verticalRatio = 0,
  beforeRelease?: () => Promise<void>,
  steps = 8,
) {
  const bounds = await target.boundingBox()
  if (!bounds) throw new Error('Swipe target is not visible')

  const startX = bounds.x + bounds.width / 2
  const startY = bounds.y + bounds.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(
    startX + bounds.width * horizontalRatio,
    startY + bounds.height * verticalRatio,
    { steps },
  )
  if (beforeRelease) await beforeRelease()
  await page.mouse.up()
}

async function touchDragAcross(
  page: Page,
  target: Locator,
  horizontalRatio: number,
  verticalRatio = 0,
  beforeRelease?: () => Promise<void>,
) {
  const bounds = await target.boundingBox()
  if (!bounds) throw new Error('Touch swipe target is not visible')

  const session = await page.context().newCDPSession(page)
  const startX = bounds.x + bounds.width / 2
  const startY = bounds.y + bounds.height / 2
  const touchPoint = (x: number, y: number) => [
    { x, y, id: 1, radiusX: 5, radiusY: 5, force: 1 },
  ]

  await session.send('Emulation.setTouchEmulationEnabled', {
    enabled: true,
    maxTouchPoints: 1,
  })
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: touchPoint(startX, startY),
  })
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: touchPoint(startX + 3, startY + 3),
  })
  for (let step = 1; step <= 8; step += 1) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: touchPoint(
        startX + bounds.width * horizontalRatio * (step / 8),
        startY + bounds.height * verticalRatio * (step / 8),
      ),
    })
  }

  if (beforeRelease) await beforeRelease()

  await session.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  })
  await session.detach()
}

test.describe('Shared Grocery & Todo UI with Supabase', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!hasTestConfig, 'Set Supabase and allowlisted E2E credentials')

  const cleanupListTitles = new Set<string>()
  const cleanupCategoryNames = new Set<string>()
  let client: SupabaseClient<Database>

  test.beforeAll(async () => {
    client = createTestClient()
    const { error } = await client.auth.signInWithPassword({
      email: testEmail!,
      password: testPassword!,
    })
    expect(error, 'The configured allowlisted test account must authenticate').toBeNull()
  })

  test.afterEach(async () => {
    for (const title of cleanupListTitles) {
      await client.from('lists').delete().eq('title', title)
    }
    for (const name of cleanupCategoryNames) {
      await client.from('categories').delete().eq('name', name)
    }
    cleanupListTitles.clear()
    cleanupCategoryNames.clear()
  })

  test.afterAll(async () => {
    await client.auth.signOut()
  })

  test('logs in and loads searchable categories from PostgreSQL', async ({ page }) => {
    await signInViaUi(page)
    await page.getByRole('button', { name: 'Categories', exact: true }).click()

    await expect(page.getByRole('heading', { name: 'Categories' })).toBeVisible()
    const fruitHeading = page.getByRole('heading', { name: 'Owoce', exact: true })
    await expect(fruitHeading).toBeVisible()
    const fruitCard = page.locator('article').filter({ has: fruitHeading })
    await expect(fruitCard.getByText('jabłko', { exact: true })).toBeVisible()

    await page.getByPlaceholder('Search categories or items').fill('jabłko')
    await expect(page.getByRole('heading', { name: 'Owoce', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Pieczywo', exact: true })).toBeHidden()
  })

  test('keeps views in the URL and supports browser history navigation', async ({
    page,
  }) => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const listTitle = `Playwright navigation list ${suffix}`
    cleanupListTitles.add(listTitle)

    const { data: list, error } = await client
      .from('lists')
      .insert({ title: listTitle, list_type: 'shopping' })
      .select('id')
      .single()
    expect(error).toBeNull()

    await signInViaUi(page)
    await page.getByText(listTitle, { exact: true }).click()

    await expect(page).toHaveURL(new RegExp(`\\?list=${list!.id}$`))
    await expect(page.getByRole('heading', { name: listTitle })).toBeVisible()

    await page.goBack()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { name: 'My Lists' })).toBeVisible()

    await page.goForward()
    await expect(page).toHaveURL(new RegExp(`\\?list=${list!.id}$`))
    await expect(page.getByRole('heading', { name: listTitle })).toBeVisible()

    await page.reload()
    await expect(page.getByRole('heading', { name: listTitle })).toBeVisible()

    await page.goto(`/?list=${list!.id}`)
    await expect(page.getByRole('heading', { name: listTitle })).toBeVisible()
    await page.getByRole('button', { name: 'Back to lists' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { name: 'My Lists' })).toBeVisible()

    await page.getByRole('button', { name: 'Categories', exact: true }).click()
    await expect(page).toHaveURL(/\?view=categories$/)
    await expect(page.getByRole('heading', { name: 'Categories' })).toBeVisible()

    await page.goBack()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { name: 'My Lists' })).toBeVisible()

    await page.goForward()
    await expect(page).toHaveURL(/\?view=categories$/)
    await expect(page.getByRole('heading', { name: 'Categories' })).toBeVisible()
  })

  test('switches the UI to Polish and remembers the selection', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Switch language to Polish' }).click()

    await expect(page.locator('html')).toHaveAttribute('lang', 'pl')
    await expect(page.getByRole('heading', { name: 'Witaj w List Up!' })).toBeVisible()
    await expect(page.getByLabel('E-mail')).toBeVisible()
    await expect(page.getByLabel('Hasło')).toBeVisible()

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Witaj w List Up!' })).toBeVisible()

    await page.getByLabel('E-mail').fill(testEmail!)
    await page.getByLabel('Hasło').fill(testPassword!)
    await page.getByRole('button', { name: 'Zaloguj się' }).click()

    await expect(page.getByRole('heading', { name: 'Moje listy' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Kategorie', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Wyloguj' })).toBeVisible()

    await page
      .getByRole('button', { name: 'Przełącz język na angielski' })
      .click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByRole('heading', { name: 'My Lists' })).toBeVisible()
  })

  test('creates a list and persists item operations in Supabase', async ({ page }) => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const listTitle = `Playwright UI list ${suffix}`
    const renamedListTitle = `${listTitle} renamed`
    const itemName = `Playwright item ${suffix}`
    cleanupListTitles.add(listTitle)
    cleanupListTitles.add(renamedListTitle)

    await signInViaUi(page)
    await page.getByRole('button', { name: /Create New List/ }).click()
    await page.getByLabel('Name your list').fill(listTitle)
    await page.getByRole('button', { name: 'Create', exact: true }).click()

    await expect(page.getByRole('heading', { name: listTitle })).toBeVisible()
    await expectDatabaseCount(client, 'lists', listTitle, 1)

    const itemInput = page.getByRole('combobox', { name: 'Item name' })
    await itemInput.fill('j')
    await expect(page.getByRole('listbox')).toHaveCount(0)

    await itemInput.fill('ja')
    const fruitSuggestion = page.getByRole('option', { name: /jabłko.*Owoce/i })
    await expect(fruitSuggestion).toBeVisible()
    await fruitSuggestion.click()
    await expect(itemInput).toHaveValue('jabłko')
    await expect(page.getByRole('button', { name: /Owoce/ })).toHaveClass(
      /bg-primary/,
    )

    await itemInput.fill(itemName)
    const quantityInput = page.getByPlaceholder('Qty')
    await itemInput.press('Enter')
    await expect(quantityInput).toBeFocused()
    await quantityInput.fill('2')
    await quantityInput.press('Enter')
    await expect(itemInput).toBeFocused()

    const item = page.getByText(itemName, { exact: true })
    await expect(item).toBeVisible()
    await expectDatabaseCount(client, 'list_items', itemName, 1)

    await page.getByRole('button', { name: `Toggle ${itemName}` }).click()
    await expect(item).toHaveClass(/line-through/)
    await expect
      .poll(async () => {
        const { data, error } = await client
          .from('list_items')
          .select('is_done, done_at')
          .eq('name', itemName)
          .single()
        expect(error).toBeNull()
        return Boolean(data?.is_done && data.done_at)
      })
      .toBe(true)

    await page.getByRole('button', { name: `Delete ${itemName}` }).click()
    await expect(item).toHaveCount(0)
    await expectDatabaseCount(client, 'list_items', itemName, 0)

    await page.getByRole('button', { name: 'Back to lists' }).click()
    await page.getByRole('button', { name: `Rename ${listTitle}` }).click()
    await page.getByLabel(`New name for ${listTitle}`).fill(renamedListTitle)
    await page.getByRole('button', { name: 'Save list name' }).click()
    await expect(page.getByText(renamedListTitle, { exact: true })).toBeVisible()
    await expectDatabaseCount(client, 'lists', renamedListTitle, 1)

    page.once('dialog', (dialog) => void dialog.accept())
    await page.getByRole('button', { name: `Delete ${renamedListTitle}` }).click()
    await expectDatabaseCount(client, 'lists', renamedListTitle, 0)
    cleanupListTitles.delete(listTitle)
    cleanupListTitles.delete(renamedListTitle)
  })

  test('creates a flat todo list with uncategorized items', async ({ page }) => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const listTitle = `Playwright todo list ${suffix}`
    const itemName = `Playwright todo item ${suffix}`
    cleanupListTitles.add(listTitle)

    await signInViaUi(page)
    await page.getByRole('button', { name: /Create New List/ }).click()
    await expect
      .poll(() =>
        page.getByTestId('create-list-widget').evaluate((widget) => {
          const bounds = widget.getBoundingClientRect()
          return bounds.top >= 0 && bounds.bottom <= window.innerHeight
        }),
    )
      .toBe(true)
    await page.getByLabel('Name your list').fill(listTitle)
    const listTypeGroup = page.getByRole('group', { name: 'List type' })
    await listTypeGroup.getByText('Todo', { exact: true }).click()
    await expect(listTypeGroup.getByRole('radio', { name: /^Todo/ })).toBeChecked()
    await page.getByRole('button', { name: 'Create', exact: true }).click()

    await expect(page.getByRole('heading', { name: listTitle })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Auto', exact: true })).toHaveCount(0)
    await expect(page.getByPlaceholder('Qty')).toHaveCount(0)

    const taskInput = page.getByRole('textbox', { name: 'Task name', exact: true })
    await taskInput.fill(itemName)
    await taskInput.press('Enter')
    await expect(taskInput).toBeFocused()

    await expect(page.getByText(itemName, { exact: true })).toBeVisible()
    await expect(page.getByText('Other', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Move / })).toHaveCount(0)
    await expect
      .poll(async () => {
        const { data, error } = await client
          .from('list_items')
          .select('category_id, lists!inner(title, list_type)')
          .eq('name', itemName)
          .eq('lists.title', listTitle)
          .single()
        expect(error).toBeNull()
        return {
          categoryId: data?.category_id,
          listType: data?.lists.list_type,
        }
      })
      .toEqual({ categoryId: null, listType: 'todo' })

    await page.getByRole('button', { name: 'Back to lists' }).click()
    const todoCard = page.locator('article').filter({ hasText: listTitle })
    await expect(todoCard.getByRole('img', { name: 'Todo' })).toBeVisible()

    await todoCard.getByRole('button', { name: `Rename ${listTitle}` }).click()
    await expect(todoCard.getByRole('radio')).toHaveCount(0)
    await todoCard.getByRole('button', { name: 'Cancel list rename' }).click()

    page.once('dialog', (dialog) => void dialog.accept())
    await todoCard.getByRole('button', { name: `Delete ${listTitle}` }).click()
    await expectDatabaseCount(client, 'lists', listTitle, 0)
    cleanupListTitles.delete(listTitle)
  })

  test('deletes list items and lists with thresholded swipes in both directions', async ({
    page,
  }) => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const listTitle = `Playwright swipe list ${suffix}`
    const rightSwipeItem = `Playwright swipe right ${suffix}`
    const leftSwipeItem = `Playwright swipe left ${suffix}`
    const flickSwipeItem = `Playwright swipe flick ${suffix}`
    const retainedItem = `Playwright retained item ${suffix}`
    cleanupListTitles.add(listTitle)

    const { data: list, error: listError } = await client
      .from('lists')
      .insert({ title: listTitle, list_type: 'todo' })
      .select('id')
      .single()
    expect(listError).toBeNull()

    const { error: itemsError } = await client.from('list_items').insert([
      { list_id: list!.id, name: rightSwipeItem },
      { list_id: list!.id, name: leftSwipeItem },
      { list_id: list!.id, name: flickSwipeItem },
      { list_id: list!.id, name: retainedItem },
    ])
    expect(itemsError).toBeNull()

    await signInViaUi(page)
    const listCard = page
      .locator('[data-swipe-to-delete]')
      .filter({ hasText: listTitle })

    await dragAcross(page, listCard, 0.25, 0, async () => {
      await expect(listCard).toHaveAttribute('data-swipe-state', 'swiping')
      await expect(listCard).toHaveAttribute('data-swipe-direction', 'right')
      await expect(listCard.locator('[aria-hidden="true"]').first()).toHaveCSS(
        'opacity',
        '1',
      )
      await page.waitForTimeout(150)
    })
    await expect(listCard).toHaveAttribute('data-swipe-state', 'idle')
    await expectDatabaseCount(client, 'lists', listTitle, 1)

    await page.waitForTimeout(500)
    await page.getByText(listTitle, { exact: true }).click()
    await expect(page.getByRole('heading', { name: listTitle })).toBeVisible()

    const rightSwipeRow = page
      .locator('[data-swipe-to-delete]')
      .filter({ hasText: rightSwipeItem })
    await touchDragAcross(page, rightSwipeRow, 0.42, 0, async () => {
      await expect(rightSwipeRow).toHaveAttribute('data-swipe-state', 'swiping')
      await expect(rightSwipeRow).toHaveAttribute('data-swipe-direction', 'right')
    })
    await expect(page.getByText(rightSwipeItem, { exact: true })).toHaveCount(0)
    await expectDatabaseCount(client, 'list_items', rightSwipeItem, 0)

    const leftSwipeRow = page
      .locator('[data-swipe-to-delete]')
      .filter({ hasText: leftSwipeItem })
    await dragAcross(page, leftSwipeRow, -0.6)
    await expect(page.getByText(leftSwipeItem, { exact: true })).toHaveCount(0)
    await expectDatabaseCount(client, 'list_items', leftSwipeItem, 0)

    const flickSwipeRow = page
      .locator('[data-swipe-to-delete]')
      .filter({ hasText: flickSwipeItem })
    await dragAcross(page, flickSwipeRow, -0.24, 0, undefined, 1)
    await expect(page.getByText(flickSwipeItem, { exact: true })).toHaveCount(0)
    await expectDatabaseCount(client, 'list_items', flickSwipeItem, 0)

    const retainedRow = page
      .locator('[data-swipe-to-delete]')
      .filter({ hasText: retainedItem })
    await dragAcross(page, retainedRow, 0.05, 0.6)
    await expect(page.getByText(retainedItem, { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Back to lists' }).click()
    const cardAfterReturn = page
      .locator('[data-swipe-to-delete]')
      .filter({ hasText: listTitle })

    page.once('dialog', (dialog) => void dialog.dismiss())
    await dragAcross(page, cardAfterReturn, -0.6)
    await expect(cardAfterReturn).toHaveAttribute('data-swipe-state', 'idle')
    await expectDatabaseCount(client, 'lists', listTitle, 1)

    page.once('dialog', (dialog) => void dialog.accept())
    await dragAcross(page, cardAfterReturn, 0.6)
    await expect(cardAfterReturn).toHaveCount(0)
    await expectDatabaseCount(client, 'lists', listTitle, 0)
    cleanupListTitles.delete(listTitle)
  })

  test('queues an offline mutation and synchronizes it after reconnecting', async ({
    context,
    page,
  }) => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const listTitle = `Playwright offline list ${suffix}`
    cleanupListTitles.add(listTitle)

    await signInViaUi(page)
    await context.setOffline(true)
    await page.getByRole('button', { name: /Create New List/ }).click()
    await page.getByLabel('Name your list').fill(listTitle)
    await page.getByRole('button', { name: 'Create', exact: true }).click()

    await expect(page.getByRole('heading', { name: listTitle })).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: 'Offline' })).toBeVisible()
    await expect.poll(() => getOutboxCount(page)).toBe(1)

    await context.setOffline(false)
    await expectDatabaseCount(client, 'lists', listTitle, 1)
    await expect.poll(() => getOutboxCount(page)).toBe(0)

    await page.getByRole('button', { name: 'Back to lists' }).click()
    page.once('dialog', (dialog) => void dialog.accept())
    await page.getByRole('button', { name: `Delete ${listTitle}` }).click()
    await expectDatabaseCount(client, 'lists', listTitle, 0)
    cleanupListTitles.delete(listTitle)
  })

  test('creates, renames, searches, edits items, and deletes a category', async ({
    page,
  }) => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const originalName = `Playwright category ${suffix}`
    const renamedName = `${originalName} renamed`
    const categoryItem = `Playwright category item ${suffix}`
    cleanupCategoryNames.add(originalName)
    cleanupCategoryNames.add(renamedName)

    await signInViaUi(page)
    await page.getByRole('button', { name: 'Categories', exact: true }).click()
    await page.getByRole('button', { name: 'Add category' }).click()
    await page.getByLabel('Category name').fill(originalName)
    await page.getByRole('button', { name: 'Add', exact: true }).click()

    await expect(page.getByRole('heading', { name: originalName })).toBeVisible()
    await expectDatabaseCount(client, 'categories', originalName, 1)

    await page.getByRole('button', { name: `Edit ${originalName}` }).click()
    const editDialog = page.getByRole('dialog', { name: 'Edit category' })
    const saveCategoryButton = editDialog.getByRole('button', {
      name: 'Save changes',
    })
    const categoryNameInput = editDialog.getByLabel('Category name')
    const categoryItemInput = editDialog.getByPlaceholder('e.g. avocado')
    const addCategoryItemButton = editDialog.getByRole('button', {
      name: 'Add category item',
    })
    await expect(editDialog).toBeVisible()
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden')
    await expect(saveCategoryButton).toBeDisabled()

    await categoryNameInput.fill(renamedName)
    await expect(saveCategoryButton).toBeEnabled()
    await categoryNameInput.fill(originalName)
    await expect(saveCategoryButton).toBeDisabled()

    await categoryItemInput.fill(categoryItem)
    await expect(saveCategoryButton).toBeDisabled()
    await addCategoryItemButton.click()
    await expect(saveCategoryButton).toBeEnabled()

    await categoryNameInput.fill(renamedName)
    await saveCategoryButton.click()

    await expect(editDialog).toHaveCount(0)
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden')
    await expect(page.getByRole('heading', { name: renamedName })).toBeVisible()
    await expectDatabaseCount(client, 'categories', renamedName, 1)
    await expect
      .poll(async () => {
        const { data, error } = await client
          .from('categories')
          .select('keywords')
          .eq('name', renamedName)
          .single()
        expect(error).toBeNull()
        return data?.keywords.includes(categoryItem)
      })
      .toBe(true)

    await page.getByPlaceholder('Search categories or items').fill(categoryItem)
    await expect(page.getByRole('heading', { name: renamedName })).toBeVisible()

    await page.getByRole('button', { name: `Edit ${renamedName}` }).click()
    await expect(saveCategoryButton).toBeDisabled()
    await editDialog
      .getByRole('button', { name: `Remove ${categoryItem} from category` })
      .click()
    await expect(saveCategoryButton).toBeEnabled()
    await expect(editDialog.getByText(categoryItem, { exact: true })).toHaveCount(0)

    await categoryItemInput.fill(categoryItem)
    await expect(saveCategoryButton).toBeEnabled()
    await addCategoryItemButton.click()
    await expect(saveCategoryButton).toBeDisabled()
    await expect(editDialog.getByText(categoryItem, { exact: true })).toBeVisible()

    await editDialog
      .getByRole('button', { name: `Remove ${categoryItem} from category` })
      .click()
    await expect(saveCategoryButton).toBeEnabled()
    await saveCategoryButton.click()

    await expect(editDialog).toHaveCount(0)
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden')
    await expect
      .poll(async () => {
        const { data, error } = await client
          .from('categories')
          .select('keywords')
          .eq('name', renamedName)
          .single()
        expect(error).toBeNull()
        return data?.keywords.includes(categoryItem)
      })
      .toBe(false)
    await expect(page.getByRole('heading', { name: renamedName })).toHaveCount(0)

    await page.getByPlaceholder('Search categories or items').fill('')
    await expect(page.getByRole('heading', { name: renamedName })).toBeVisible()

    page.once('dialog', (dialog) => void dialog.accept())
    await page.getByRole('button', { name: `Delete ${renamedName}` }).click()
    await expect(page.getByRole('heading', { name: renamedName })).toHaveCount(0)
    await expectDatabaseCount(client, 'categories', renamedName, 0)
    cleanupCategoryNames.delete(originalName)
    cleanupCategoryNames.delete(renamedName)
  })

  test('receives list and item changes from Supabase Realtime', async ({ page }) => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const listTitle = `Playwright Realtime list ${suffix}`
    const itemName = `Playwright Realtime item ${suffix}`
    cleanupListTitles.add(listTitle)

    const realtimeReady = waitForRealtimeSubscription(page, 'lists:')
    await signInViaUi(page)
    await realtimeReady

    const { data: list, error: listError } = await client
      .from('lists')
      .insert({ title: listTitle })
      .select('id')
      .single()
    expect(listError).toBeNull()

    const remoteList = page.getByText(listTitle, { exact: true })
    await expect(remoteList).toBeVisible()
    await remoteList.click()
    await expect(page.getByRole('heading', { name: listTitle })).toBeVisible()

    const { data: category, error: categoryError } = await client
      .from('categories')
      .select('id')
      .eq('name', 'Owoce')
      .single()
    expect(categoryError).toBeNull()

    const { error: itemError } = await client.from('list_items').insert({
      list_id: list!.id,
      category_id: category!.id,
      name: itemName,
    })
    expect(itemError).toBeNull()
    await expect(page.getByText(itemName, { exact: true })).toBeVisible()

    const { error: deleteError } = await client.from('lists').delete().eq('id', list!.id)
    expect(deleteError).toBeNull()
    await expect(page.getByRole('heading', { name: 'My Lists' })).toBeVisible()
    cleanupListTitles.delete(listTitle)
  })

  test('logs out and returns to the login screen', async ({ page }) => {
    await signInViaUi(page)
    await page.getByRole('button', { name: 'Logout' }).click()
    await expect(page.getByRole('heading', { name: 'Welcome to List Up!' })).toBeVisible()
  })
})
