import { expect, test } from '@playwright/test'

test.describe('Shared Grocery & Todo UI', () => {
  test('renders lists and filters categories', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'My Lists' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Weekly Groceries/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Apartment To-dos/ })).toBeVisible()

    await page.getByRole('button', { name: 'Categories', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Categories' })).toBeVisible()

    const search = page.getByPlaceholder('Search categories')
    await search.fill('Dairy')

    await expect(page.getByRole('heading', { name: 'Dairy & Eggs' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Produce' })).toBeHidden()
  })

  test('creates a list and manages its items optimistically', async ({ page }) => {
    const listTitle = `Playwright list ${Date.now()}`
    const itemName = `Playwright item ${Date.now()}`

    await page.goto('/')
    await page.getByRole('button', { name: /Create New List/ }).click()
    await page.getByLabel('Name your list').fill(listTitle)
    await page.getByRole('button', { name: 'Create', exact: true }).click()

    await expect(page.getByRole('heading', { name: listTitle })).toBeVisible()
    await expect(page.getByText('This list is empty')).toBeVisible()

    await page.getByPlaceholder('Add an item…').fill(itemName)
    await page.getByPlaceholder('Qty').fill('2')
    await page.getByRole('button', { name: 'Add item' }).click()

    const item = page.getByText(itemName, { exact: true })
    await expect(item).toBeVisible()
    await expect(page.getByText('2', { exact: true })).toBeVisible()

    await item.click()
    await expect(item).toHaveClass(/line-through/)

    await page.getByRole('button', { name: `Delete ${itemName}` }).click()
    await expect(item).toHaveCount(0)
    await expect(page.getByText('This list is empty')).toBeVisible()
  })

  test('creates, renames, searches, and deletes a category', async ({ page }) => {
    const originalName = `Playwright category ${Date.now()}`
    const renamedName = `${originalName} renamed`

    await page.goto('/')
    await page.getByRole('button', { name: 'Categories', exact: true }).click()
    await page.getByRole('button', { name: 'Add category' }).click()

    await page.getByLabel('Category emoji').fill('🧪')
    await page.getByPlaceholder('Category name').fill(originalName)
    await page.getByRole('button', { name: 'Add', exact: true }).click()

    await expect(page.getByRole('heading', { name: originalName })).toBeVisible()
    await page.getByRole('button', { name: `Edit ${originalName}` }).click()

    const editInput = page
      .getByRole('button', { name: 'Save name' })
      .locator('..')
      .locator('input')
    await editInput.fill(renamedName)
    await page.getByRole('button', { name: 'Save name' }).click()

    const search = page.getByPlaceholder('Search categories')
    await search.fill(renamedName)
    await expect(page.getByRole('heading', { name: renamedName })).toBeVisible()

    await page.getByRole('button', { name: `Delete ${renamedName}` }).click()
    await expect(page.getByRole('heading', { name: renamedName })).toHaveCount(0)
  })
})
