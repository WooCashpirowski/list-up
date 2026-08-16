'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { createSupabaseAuthGateway } from '../services/supabase-auth.gateway'
import type {
  AuthSession,
  AuthStatus,
  AuthUser,
  SignInInput,
} from '../types/auth.types'

type AuthContextValue = {
  session: AuthSession | null
  user: AuthUser | null
  status: AuthStatus
  signIn: (input: SignInInput) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const gateway = useMemo(() => createSupabaseAuthGateway(), [])
  const [session, setSession] = useState<AuthSession | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')

  useEffect(() => {
    let active = true

    void gateway
      .getSession()
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

    const unsubscribe = gateway.subscribe((nextSession) => {
      if (!active) return
      setSession(nextSession)
      setStatus(nextSession ? 'authenticated' : 'anonymous')
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [gateway])

  const handleSignIn = useCallback(
    async (input: SignInInput) => {
      setStatus('loading')

      try {
        const nextSession = await gateway.signIn(input)
        setSession(nextSession)
        setStatus('authenticated')
      } catch (error) {
        setSession(null)
        setStatus('anonymous')
        throw error
      }
    },
    [gateway],
  )

  const handleSignOut = useCallback(async () => {
    await gateway.signOut()
    setSession(null)
    setStatus('anonymous')
  }, [gateway])

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
