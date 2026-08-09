import type {
  CachedCollectionName,
  OutboxMutation,
  QueueMutationInput,
} from '../types/offline.types'

const DATABASE_NAME = 'list-up-offline'
const DATABASE_VERSION = 1
const CACHE_STORE = 'cache'
const OUTBOX_STORE = 'outbox'
const OUTBOX_USER_INDEX = 'by-user'

export const OUTBOX_CHANGED_EVENT = 'list-up:outbox-changed'
export const OUTBOX_SYNCED_EVENT = 'list-up:outbox-synced'

type CacheRecord<T = unknown> = {
  key: string
  userId: string
  collection: CachedCollectionName
  value: T
  updatedAt: string
}

let databasePromise: Promise<IDBDatabase> | null = null
let lastMutationSequence = 0

function nextMutationSequence(): number {
  const clock =
    typeof performance === 'undefined'
      ? Date.now() * 1_000
      : Math.round((performance.timeOrigin + performance.now()) * 1_000)
  lastMutationSequence = Math.max(clock, lastMutationSequence + 1)
  return lastMutationSequence
}

function getDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available'))
  }

  databasePromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result

      if (!database.objectStoreNames.contains(CACHE_STORE)) {
        database.createObjectStore(CACHE_STORE, { keyPath: 'key' })
      }

      if (!database.objectStoreNames.contains(OUTBOX_STORE)) {
        const outbox = database.createObjectStore(OUTBOX_STORE, { keyPath: 'id' })
        outbox.createIndex(OUTBOX_USER_INDEX, 'userId', { unique: false })
      }
    }

    request.onsuccess = () => {
      const database = request.result
      database.onversionchange = () => {
        database.close()
        databasePromise = null
      }
      resolve(database)
    }
    request.onerror = () => reject(request.error ?? new Error('Could not open IndexedDB'))
    request.onblocked = () => reject(new Error('IndexedDB upgrade is blocked'))
  })

  return databasePromise
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction failed'))
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction was aborted'))
  })
}

function cacheKey(userId: string, collection: CachedCollectionName): string {
  return `${userId}:${collection}`
}

function announceOutboxChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(OUTBOX_CHANGED_EVENT))
  }
}

export async function getCachedCollection<T>(
  userId: string,
  collection: CachedCollectionName,
): Promise<T[] | null> {
  const database = await getDatabase()
  const transaction = database.transaction(CACHE_STORE, 'readonly')
  const request = transaction.objectStore(CACHE_STORE).get(cacheKey(userId, collection))
  const record = (await requestResult(request)) as CacheRecord<T[]> | undefined
  await transactionComplete(transaction)
  return record?.value ?? null
}

export async function saveCachedCollection<T>(
  userId: string,
  collection: CachedCollectionName,
  value: T[],
): Promise<void> {
  const database = await getDatabase()
  const transaction = database.transaction(CACHE_STORE, 'readwrite')
  const record: CacheRecord<T[]> = {
    key: cacheKey(userId, collection),
    userId,
    collection,
    value,
    updatedAt: new Date().toISOString(),
  }

  transaction.objectStore(CACHE_STORE).put(record)
  await transactionComplete(transaction)
}

export async function enqueueMutation(
  input: QueueMutationInput,
): Promise<OutboxMutation> {
  const [mutation] = await enqueueMutations([input])
  return mutation
}

export async function enqueueMutations(
  inputs: QueueMutationInput[],
): Promise<OutboxMutation[]> {
  if (inputs.length === 0) return []

  const createdAt = new Date().toISOString()
  const mutations = inputs.map(
    (input): OutboxMutation => ({
      ...input,
      id: crypto.randomUUID(),
      payload: input.payload ?? null,
      createdAt,
      sequence: nextMutationSequence(),
      attempts: 0,
      lastError: null,
    }),
  )
  const database = await getDatabase()
  const transaction = database.transaction(OUTBOX_STORE, 'readwrite')
  const store = transaction.objectStore(OUTBOX_STORE)
  for (const mutation of mutations) store.add(mutation)
  await transactionComplete(transaction)
  announceOutboxChange()
  return mutations
}

export async function getOutboxMutations(userId: string): Promise<OutboxMutation[]> {
  const database = await getDatabase()
  const transaction = database.transaction(OUTBOX_STORE, 'readonly')
  const index = transaction.objectStore(OUTBOX_STORE).index(OUTBOX_USER_INDEX)
  const records = (await requestResult(
    index.getAll(IDBKeyRange.only(userId)),
  )) as OutboxMutation[]
  await transactionComplete(transaction)
  return records.sort(
    (left, right) =>
      (left.sequence ?? Date.parse(left.createdAt) * 1_000) -
      (right.sequence ?? Date.parse(right.createdAt) * 1_000),
  )
}

export async function removeOutboxMutation(id: string): Promise<void> {
  const database = await getDatabase()
  const transaction = database.transaction(OUTBOX_STORE, 'readwrite')
  transaction.objectStore(OUTBOX_STORE).delete(id)
  await transactionComplete(transaction)
}

export async function recordOutboxFailure(
  mutation: OutboxMutation,
  message: string,
): Promise<void> {
  const database = await getDatabase()
  const transaction = database.transaction(OUTBOX_STORE, 'readwrite')
  transaction.objectStore(OUTBOX_STORE).put({
    ...mutation,
    attempts: mutation.attempts + 1,
    lastError: message,
  } satisfies OutboxMutation)
  await transactionComplete(transaction)
}
