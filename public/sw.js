const CACHE_PREFIX = 'list-up-pwa'
const APP_SHELL_CACHE = `${CACHE_PREFIX}-shell-v4`
const RUNTIME_CACHE = `${CACHE_PREFIX}-runtime-v4`
const PRECACHE_URLS = [
  '/',
  '/offline.html',
  '/manifest.webmanifest',
  '/pwa-icon-192.png',
  '/pwa-icon-512.png',
  '/pwa-icon-maskable-512.png',
  '/notification-badge-96.png',
  '/apple-icon.png',
]

async function precacheAppShell() {
  const cache = await caches.open(APP_SHELL_CACHE)
  await cache.addAll(PRECACHE_URLS)

  const shell = await cache.match('/')
  if (!shell) return

  const html = await shell.text()
  const assetUrls = Array.from(html.matchAll(/(?:src|href)=["']([^"']+)["']/g))
    .map((match) => match[1])
    .filter((path) => path.startsWith('/_next/static/'))

  await Promise.allSettled(assetUrls.map((path) => cache.add(path)))
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheAppShell().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && ![APP_SHELL_CACHE, RUNTIME_CACHE].includes(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

async function networkFirstNavigation(request) {
  const cache = await caches.open(RUNTIME_CACHE)

  try {
    const response = await fetch(request)
    if (response.ok) await cache.put(request, response.clone())
    return response
  } catch {
    return (
      (await cache.match(request)) ??
      (await caches.match('/')) ??
      (await caches.match('/offline.html'))
    )
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached

  const response = await fetch(request)
  if (response.ok) {
    const cache = await caches.open(RUNTIME_CACHE)
    await cache.put(request, response.clone())
  }
  return response
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)

  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request))
    return
  }

  const isApplicationAsset =
    url.pathname.startsWith('/_next/static/') ||
    ['script', 'style', 'font', 'image'].includes(request.destination) ||
    PRECACHE_URLS.includes(url.pathname)

  if (isApplicationAsset) event.respondWith(cacheFirst(request))
})

function readPushPayload(event) {
  if (!event.data) return null

  try {
    return event.data.json()
  } catch {
    return {
      title: 'List Up!',
      body: event.data.text(),
      tag: 'list-up-chat',
      url: '/?view=chat',
    }
  }
}

async function hasFocusedChatClient() {
  const windows = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  })

  return windows.some((client) => {
    const url = new URL(client.url)
    return (
      client.focused &&
      client.visibilityState === 'visible' &&
      url.origin === self.location.origin &&
      url.searchParams.get('view') === 'chat'
    )
  })
}

self.addEventListener('push', (event) => {
  const payload = readPushPayload(event)
  if (!payload) return

  event.waitUntil(
    hasFocusedChatClient().then((chatIsFocused) => {
      if (chatIsFocused) return undefined

      return self.registration.showNotification(payload.title || 'List Up!', {
        body: payload.body || 'Nowa wiadomość',
        tag: payload.tag || 'list-up-chat',
        renotify: true,
        icon: '/pwa-icon-192.png',
        badge: '/notification-badge-96.png',
        data: {
          url: payload.url || '/?view=chat',
        },
      })
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const requestedUrl = new URL(
    event.notification.data?.url || '/?view=chat',
    self.location.origin,
  ).href

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(async (windows) => {
        const current = windows.find(
          (client) => new URL(client.url).origin === self.location.origin,
        )

        if (current) {
          if ('navigate' in current) await current.navigate(requestedUrl)
          await current.focus()
          return
        }

        await self.clients.openWindow(requestedUrl)
      }),
  )
})
