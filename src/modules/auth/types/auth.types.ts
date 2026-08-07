export type SignInInput = {
  email: string
  password: string
}

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'
