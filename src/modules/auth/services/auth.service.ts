import type { Session } from '@supabase/supabase-js'

import type { AppSupabaseClient } from '@/src/lib/supabase/service-client'
import { resolveSupabaseClient } from '@/src/lib/supabase/service-client'

import type { SignInInput } from '../types/auth.types'

export async function getSession(
  client?: AppSupabaseClient,
): Promise<Session | null> {
  const supabase = resolveSupabaseClient(client)
  const { data, error } = await supabase.auth.getSession()

  if (error) {
    throw error
  }

  return data.session
}

export async function signInWithPassword(
  input: SignInInput,
  client?: AppSupabaseClient,
): Promise<Session> {
  const supabase = resolveSupabaseClient(client)
  const { data, error } = await supabase.auth.signInWithPassword(input)

  if (error) {
    throw error
  }

  if (!data.session) {
    throw new Error('Supabase did not return a session')
  }

  return data.session
}

export async function signOut(client?: AppSupabaseClient): Promise<void> {
  const supabase = resolveSupabaseClient(client)
  const { error } = await supabase.auth.signOut()

  if (error) {
    throw error
  }
}
