import type { AppSupabaseClient } from '@/src/lib/supabase/service-client'
import { resolveSupabaseClient } from '@/src/lib/supabase/service-client'

import type {
  CreateProfileInput,
  Profile,
  UpdateProfileInput,
} from '../types/profile.types'

export async function getProfiles(
  client?: AppSupabaseClient,
): Promise<Profile[]> {
  const supabase = resolveSupabaseClient(client)
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .order('email', { ascending: true })
    .throwOnError()

  return data
}

export async function getProfileById(
  id: string,
  client?: AppSupabaseClient,
): Promise<Profile | null> {
  const supabase = resolveSupabaseClient(client)
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .maybeSingle()
    .throwOnError()

  return data
}

export async function createProfile(
  input: CreateProfileInput,
  client?: AppSupabaseClient,
): Promise<Profile> {
  const supabase = resolveSupabaseClient(client)
  const { data } = await supabase
    .from('profiles')
    .insert(input)
    .select('*')
    .single()
    .throwOnError()

  return data
}

export async function updateProfile(
  id: string,
  input: UpdateProfileInput,
  client?: AppSupabaseClient,
): Promise<Profile> {
  const supabase = resolveSupabaseClient(client)
  const { data } = await supabase
    .from('profiles')
    .update(input)
    .eq('id', id)
    .select('*')
    .single()
    .throwOnError()

  return data
}

export async function deleteProfile(
  id: string,
  client?: AppSupabaseClient,
): Promise<Profile> {
  const supabase = resolveSupabaseClient(client)
  const { data } = await supabase
    .from('profiles')
    .delete()
    .eq('id', id)
    .select('*')
    .single()
    .throwOnError()

  return data
}
