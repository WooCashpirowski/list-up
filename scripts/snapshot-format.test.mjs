import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertLocal } from './local-runtime.mjs'
import { extractSnapshot, snapshotTables, restoreSql } from './snapshot-format.mjs'

const completeDump = () => snapshotTables.map((table) => `COPY ${table} (id) FROM stdin;\n\\.\n`).join('\n')

test('keeps persistent data and ignores token/secret/notification rows and executable SQL', () => {
  const dump = completeDump() + `COPY auth.sessions (id) FROM stdin;\nsecret-session\n\\.\nCOPY public.push_subscriptions (id) FROM stdin;\nexternal-push\n\\.\nCOPY vault.secrets (id) FROM stdin;\nsecret\n\\.\nDROP TABLE public.lists;\nSELECT pg_catalog.setval('public.test_sequence', 12, true);\n`
  const result = extractSnapshot(dump)
  assert.equal(Object.keys(result.counts).length, snapshotTables.length)
  assert.doesNotMatch(result.sql, /secret|external-push|DROP TABLE/)
  assert.match(result.sql, /setval\('public.test_sequence', 12, true\)/)
  assert.doesNotMatch(restoreSql(dump), /DROP TABLE/)
})

test('COPY data that looks like SQL stays inside the payload', () => {
  const dump = completeDump().replace('COPY public.chat_messages (id) FROM stdin;\n', 'COPY public.chat_messages (id) FROM stdin;\nDROP TABLE public.lists;\\nmessage\n')
  const { sql, counts } = extractSnapshot(dump)
  assert.equal(counts['public.chat_messages'], 1)
  assert.match(sql, /DROP TABLE public.lists;\\nmessage\n\\\./)
})

test('rejects incomplete, duplicated and truncated snapshots before a reset', () => {
  assert.throws(() => extractSnapshot(''), /missing tables/)
  assert.throws(() => extractSnapshot(completeDump() + 'COPY auth.users (id) FROM stdin;\n'), /Truncated/)
  assert.throws(() => extractSnapshot(completeDump() + 'COPY auth.users (id) FROM stdin;\n\\.\n'), /Duplicate/)
})

test('local write operations reject remote and incorrect-port endpoints', () => {
  assert.doesNotThrow(() => assertLocal('http://localhost:44321'))
  assert.doesNotThrow(() => assertLocal('http://127.0.0.1:44321'))
  assert.doesNotThrow(() => assertLocal('http://localhost:54321', { allowLegacyPort: true }))
  for (const url of ['https://staging.supabase.co', 'http://localhost:3000', 'http://localhost:54321', 'http://host.docker.internal:44321', 'https://localhost:44321']) {
    assert.throws(() => assertLocal(url), /requires local/)
  }
  for (const url of ['https://staging.supabase.co', 'http://host.docker.internal:54321', 'https://localhost:54321']) {
    assert.throws(() => assertLocal(url, { allowLegacyPort: true }), /requires local/)
  }
})
