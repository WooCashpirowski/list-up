import { resolve } from 'node:path'
import { root, readEnv, run } from './local-runtime.mjs'

const source = readEnv('.env.staging.local')
const env = { ...source, SUPABASE_URL: source.NEXT_PUBLIC_SUPABASE_URL, E2E_ENVIRONMENT: 'staging' }
const command = process.argv[2]
const args = process.argv.slice(3)
const entry = command === 'dev'
  ? ['node_modules/next/dist/bin/next', 'dev', ...args]
  : ['node_modules/@playwright/test/cli.js', 'test', ...args]
if (!['dev', 'test'].includes(command)) throw new Error('Usage: node scripts/staging.mjs dev|test')
run(process.execPath, [resolve(root, entry[0]), ...entry.slice(1)], { env }).catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
