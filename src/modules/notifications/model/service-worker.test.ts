import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'

import { expect, test } from '@playwright/test'

type WorkerEvent = {
  data?: { json: () => unknown; text: () => string }
  notification?: {
    close: () => void
    data?: { url?: string }
  }
  waitUntil: (promise: Promise<unknown>) => void
}

type WorkerListener = (event: WorkerEvent) => void

type TestWindowClient = {
  url: string
  focused: boolean
  visibilityState: 'visible' | 'hidden'
  navigate?: (url: string) => Promise<void>
  focus: () => Promise<void>
}

function loadServiceWorker(clients: TestWindowClient[]) {
  const listeners = new Map<string, WorkerListener>()
  const notifications: Array<{ title: string; options: Record<string, unknown> }> = []
  let openedUrl: string | null = null
  const source = readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf8')

  const worker = {
    location: { origin: 'https://list-up.test' },
    clients: {
      matchAll: async () => clients,
      claim: async () => undefined,
      openWindow: async (url: string) => {
        openedUrl = url
      },
    },
    registration: {
      showNotification: async (title: string, options: Record<string, unknown>) => {
        notifications.push({ title, options })
      },
    },
    addEventListener: (type: string, listener: WorkerListener) => {
      listeners.set(type, listener)
    },
    skipWaiting: async () => undefined,
  }

  runInNewContext(source, {
    self: worker,
    caches: {
      open: async () => ({
        addAll: async () => undefined,
        add: async () => undefined,
        match: async () => undefined,
        put: async () => undefined,
      }),
      keys: async () => [],
      delete: async () => true,
      match: async () => undefined,
    },
    fetch: async () => ({ ok: false }),
    URL,
    Promise,
  })

  return {
    listeners,
    notifications,
    getOpenedUrl: () => openedUrl,
  }
}

function dispatchAndWait(listener: WorkerListener, event: Omit<WorkerEvent, 'waitUntil'>) {
  let pending: Promise<unknown> | null = null
  listener({
    ...event,
    waitUntil: (promise) => {
      pending = promise
    },
  })
  if (!pending) throw new Error('Service Worker did not register asynchronous work')
  return pending
}

test('suppresses push in a focused chat and shows it elsewhere', async () => {
  const activeConversationId = '11111111-1111-4111-8111-111111111111'
  const otherConversationId = '22222222-2222-4222-8222-222222222222'
  const focusedClient: TestWindowClient = {
    url: `https://list-up.test/?view=chat&conversation=${activeConversationId}`,
    focused: true,
    visibilityState: 'visible',
    focus: async () => undefined,
  }
  const focused = loadServiceWorker([focusedClient])
  const payload = {
    title: 'Renata',
    body: 'Test message',
    tag: `list-up-chat:${activeConversationId}`,
    url: `/?view=chat&conversation=${activeConversationId}`,
  }
  await dispatchAndWait(focused.listeners.get('push')!, {
    data: { json: () => payload, text: () => payload.body },
  })
  expect(focused.notifications).toEqual([])

  const otherConversation = loadServiceWorker([focusedClient])
  const otherPayload = {
    ...payload,
    tag: `list-up-chat:${otherConversationId}`,
    url: `/?view=chat&conversation=${otherConversationId}`,
  }
  await dispatchAndWait(otherConversation.listeners.get('push')!, {
    data: { json: () => otherPayload, text: () => otherPayload.body },
  })
  expect(otherConversation.notifications).toHaveLength(1)
  expect(otherConversation.notifications[0].title).toBe('Renata')
  expect(otherConversation.notifications[0].options).toMatchObject({
    body: 'Test message',
    tag: `list-up-chat:${otherConversationId}`,
    icon: '/pwa-icon-192.png',
    badge: '/notification-badge-96.png',
    data: { url: `/?view=chat&conversation=${otherConversationId}` },
  })
})

test('notification click navigates and focuses an existing application window', async () => {
  let navigatedUrl: string | null = null
  let focusCount = 0
  const client: TestWindowClient = {
    url: 'https://list-up.test/',
    focused: false,
    visibilityState: 'visible',
    navigate: async (url) => {
      navigatedUrl = url
    },
    focus: async () => {
      focusCount += 1
    },
  }
  const worker = loadServiceWorker([client])
  await dispatchAndWait(worker.listeners.get('notificationclick')!, {
    notification: {
      close: () => undefined,
      data: { url: '/?view=chat' },
    },
  })

  expect(navigatedUrl).toBe('https://list-up.test/?view=chat')
  expect(focusCount).toBe(1)
  expect(worker.getOpenedUrl()).toBeNull()

  const withoutWindow = loadServiceWorker([])
  await dispatchAndWait(withoutWindow.listeners.get('notificationclick')!, {
    notification: {
      close: () => undefined,
      data: { url: '/?view=chat' },
    },
  })
  expect(withoutWindow.getOpenedUrl()).toBe(
    'https://list-up.test/?view=chat',
  )
})
