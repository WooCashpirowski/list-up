import type { Session } from '@supabase/supabase-js'

import type { AppSupabaseClient } from '@/src/lib/supabase/service-client'
import { resolveSupabaseClient } from '@/src/lib/supabase/service-client'

import type { AuthGateway } from '../gateways/auth.gateway'
import type { AuthSession } from '../types/auth.types'
import { getSession, signInWithPassword, signOut } from './auth.service'

function toAuthSession(session: Session): AuthSession {
  return {
    user: {
      id: session.user.id,
      email: session.user.email ?? null,
    },
  }
}

export function createSupabaseAuthGateway(
  client?: AppSupabaseClient,
): AuthGateway {
  const supabase = resolveSupabaseClient(client)

  return {
    getSession: async () => {
      const session = await getSession(supabase)
      return session ? toAuthSession(session) : null
    },
    signIn: async (input) =>
      toAuthSession(await signInWithPassword(input, supabase)),
    signOut: () => signOut(supabase),
    subscribe: (onSessionChange) => {
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        onSessionChange(session ? toAuthSession(session) : null)
      })

      return () => subscription.unsubscribe()
    },
  }
}
