import { expect, test } from '@playwright/test'

test('reopens the cached application shell without a network connection', async ({
  context,
  page,
}) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Welcome to List Up!' })).toBeVisible()

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (navigator.serviceWorker.controller) return

    await new Promise<void>((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
        once: true,
      })
    })
  })

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Welcome to List Up!' })).toBeVisible()

  await context.setOffline(true)
  try {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Welcome to List Up!' })).toBeVisible()
  } finally {
    await context.setOffline(false)
  }
})
