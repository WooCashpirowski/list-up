import { expect, test } from '@playwright/test'

test('protects the notification dispatcher', async ({ request }) => {
  const response = await request.post('/api/notifications/dispatch')
  expect(response.status()).toBe(401)
})

test('ships push and notification-click handlers in the service worker', async ({
  request,
}) => {
  const response = await request.get('/sw.js')
  expect(response.ok()).toBe(true)
  const source = await response.text()
  expect(source).toContain("addEventListener('push'")
  expect(source).toContain("addEventListener('notificationclick'")
  expect(source).toContain("url.searchParams.get('view') === 'chat'")
})

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
