import { EventEmitter } from 'node:events'
import { expect, test, type Page, type WebSocket } from '@playwright/test'

import {
  observeRealtimeSubscriptions,
  waitForRealtimeSubscription,
} from './realtime'

function mockPage() {
  const events = new EventEmitter()
  return { events, page: events as unknown as Page }
}

function mockSocket() {
  const events = new EventEmitter()
  return { events, socket: events as unknown as WebSocket }
}

function reply(topic: string, status = 'ok') {
  return JSON.stringify({ event: 'phx_reply', topic, payload: { status } })
}

test('observes a channel join on a socket opened before the wait starts', async () => {
  const { events: pageEvents, page } = mockPage()
  const { events: socketEvents, socket } = mockSocket()
  const observer = observeRealtimeSubscriptions(page)

  try {
    pageEvents.emit('websocket', socket)
    const ready = observer.waitForSubscription('list-up:chat:conversation:live')
    socketEvents.emit('framereceived', {
      payload: reply('realtime:list-up:chat:conversation:live'),
    })
    await ready
    expect(socketEvents.listenerCount('framereceived')).toBe(0)
  } finally {
    observer.dispose()
  }
  expect(pageEvents.listenerCount('websocket')).toBe(0)
  expect(socketEvents.listenerCount('close')).toBe(0)
})

test('still observes new sockets and array-format channel replies', async () => {
  const { events: pageEvents, page } = mockPage()
  const { events: socketEvents, socket } = mockSocket()
  const ready = waitForRealtimeSubscription(page, 'lists:')
  pageEvents.emit('websocket', socket)
  socketEvents.emit('framereceived', { payload: 'not JSON' })
  socketEvents.emit('framereceived', { payload: reply('realtime:other') })
  socketEvents.emit('framereceived', {
    payload: JSON.stringify([null, '1', 'realtime:lists:user', 'phx_reply', { status: 'ok' }]),
  })
  await ready
  expect(socketEvents.listenerCount('framereceived')).toBe(0)
  expect(pageEvents.listenerCount('websocket')).toBe(0)
})

test('reports a rejected channel rather than silently timing out', async () => {
  const { events: pageEvents, page } = mockPage()
  const { events: socketEvents, socket } = mockSocket()
  const ready = waitForRealtimeSubscription(page, 'list-up:chat:')
  const rejection = expect(ready).rejects.toThrow('with status error')
  pageEvents.emit('websocket', socket)
  socketEvents.emit('framereceived', {
    payload: reply('realtime:list-up:chat:conversation:live', 'error'),
  })
  await rejection
  expect(socketEvents.listenerCount('framereceived')).toBe(0)
})

test('removes frame listeners when the subscription times out', async () => {
  const { events: pageEvents, page } = mockPage()
  const { events: socketEvents, socket } = mockSocket()
  const ready = waitForRealtimeSubscription(page, 'list-up:chat:', 1)
  pageEvents.emit('websocket', socket)
  await expect(ready).rejects.toThrow('did not subscribe within 1ms')
  expect(socketEvents.listenerCount('framereceived')).toBe(0)
  expect(pageEvents.listenerCount('websocket')).toBe(0)
})
