import type {
  AuthSession,
  SignInInput,
} from '../types/auth.types'

export interface AuthGateway {
  getSession: () => Promise<AuthSession | null>
  signIn: (input: SignInInput) => Promise<AuthSession>
  signOut: () => Promise<void>
  subscribe: (
    onSessionChange: (session: AuthSession | null) => void,
  ) => () => void
}
