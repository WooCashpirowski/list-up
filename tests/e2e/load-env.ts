import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'

export function loadPlaywrightEnv(): void {
  const environment = process.env.E2E_ENVIRONMENT ?? 'local'
  if (environment !== 'local' && environment !== 'staging') {
    throw new Error('E2E_ENVIRONMENT must be local or staging')
  }

  // Staging credentials must never override the local stack implicitly.
  const sourceFile = environment === 'local' ? '.env.local' : '.env.staging.local'
  const source = parseEnv(readFileSync(sourceFile, 'utf8'))
  const sourceUrl = source.NEXT_PUBLIC_SUPABASE_URL
  if (!sourceUrl) throw new Error(`Missing NEXT_PUBLIC_SUPABASE_URL in ${sourceFile}`)
  const overlay = environment === 'staging'
    ? parseEnv(readFileSync('.env.test.local', 'utf8'))
    : {}
  const configured = { ...source, ...overlay }
  for (const [key, value] of Object.entries(configured)) {
    process.env[key] ??= value
  }
  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
  if (environment === 'local') {
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.port !== '44321') {
      throw new Error('Local E2E requires the local Supabase API on port 44321')
    }
  } else if (url.origin !== new URL(sourceUrl).origin) {
    throw new Error('Staging E2E URL must match .env.staging.local')
  }
  process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ??= process.env.SUPABASE_SERVICE_ROLE_KEY
}
