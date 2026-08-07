'use client'

import type { Session, User } from '@supabase/supabase-js'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { createClient } from '@/src/lib/supabase/client'

import { getSession, signInWithPassword, signOut } from '../services/auth.service'
import type { AuthStatus, SignInInput } from '../types/auth.types'

type AuthContextValue = {
  session: Session | null
  user: User | null
  status: AuthStatus
  signIn: (input: SignInInput) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), [])
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')

  useEffect(() => {
    let active = true

    void getSession(supabase)
      .then((currentSession) => {
        if (!active) return
        setSession(currentSession)
        setStatus(currentSession ? 'authenticated' : 'anonymous')
      })
      .catch(() => {
        if (!active) return
        setSession(null)
        setStatus('anonymous')
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      setSession(nextSession)
      setStatus(nextSession ? 'authenticated' : 'anonymous')
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [supabase])

  const handleSignIn = useCallback(
    async (input: SignInInput) => {
      setStatus('loading')

      try {
        const nextSession = await signInWithPassword(input, supabase)
        setSession(nextSession)
        setStatus('authenticated')
      } catch (error) {
        setSession(null)
        setStatus('anonymous')
        throw error
      }
    },
    [supabase],
  )

  const handleSignOut = useCallback(async () => {
    await signOut(supabase)
    setSession(null)
    setStatus('anonymous')
  }, [supabase])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      status,
      signIn: handleSignIn,
      signOut: handleSignOut,
    }),
    [handleSignIn, handleSignOut, session, status],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }

  return context
}
