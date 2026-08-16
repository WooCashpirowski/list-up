export type SignInInput = {
  email: string
  password: string
}

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

export type AuthUser = {
  id: string
  email: string | null
}

export type AuthSession = {
  user: AuthUser
}
