import type { SupabaseClient } from '@supabase/supabase-js'

import { createClient } from './client'
import type { Database } from './database.types'

export type AppSupabaseClient = SupabaseClient<Database>

export function resolveSupabaseClient(
  client?: AppSupabaseClient,
): AppSupabaseClient {
  return client ?? createClient()
}
