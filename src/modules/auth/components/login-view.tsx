'use client'

import { LockKeyhole, LogIn, Sparkles } from 'lucide-react'
import { useState } from 'react'

import { ThemeToggle } from '@/components/theme-toggle'
import { getErrorMessage } from '@/src/lib/get-error-message'
import { LanguageToggle, useI18n } from '@/src/modules/i18n'

import type { SignInInput } from '../types/auth.types'

type LoginViewProps = {
  onSignIn: (input: SignInInput) => Promise<void>
}

export function LoginView({ onSignIn }: LoginViewProps) {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<'invalidCredentials' | 'generic' | null>(null)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!email.trim() || !password) return

    setIsSubmitting(true)
    setError(null)

    try {
      await onSignIn({ email: email.trim(), password })
    } catch (nextError) {
      const message = getErrorMessage(nextError).toLocaleLowerCase()
      setError(
        message.includes('invalid login credentials')
          ? 'invalidCredentials'
          : 'generic',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-dvh bg-background px-5 text-foreground">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center py-10">
        <div className="absolute right-5 top-5 flex gap-2">
          <LanguageToggle />
          <ThemeToggle />
        </div>

        <div className="mb-8">
          <span className="mb-5 flex size-16 items-center justify-center rounded-3xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
            <Sparkles className="size-7" strokeWidth={2.2} />
          </span>
          <p className="text-sm font-medium text-muted-foreground">{t('auth.eyebrow')}</p>
          <h1 className="mt-1 text-4xl font-semibold tracking-tight">{t('auth.title')}</h1>
          <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
            {t('auth.description')}
          </p>
        </div>

        <form
          onSubmit={submit}
          className="rounded-3xl border border-border bg-card p-5 shadow-sm"
        >
          <label htmlFor="email" className="mb-2 block text-sm font-semibold">
            {t('auth.email')}
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t('auth.emailPlaceholder')}
            className="w-full rounded-2xl border border-input bg-secondary px-4 py-3 text-base outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
          />

          <label htmlFor="password" className="mb-2 mt-4 block text-sm font-semibold">
            {t('auth.password')}
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={t('auth.passwordPlaceholder')}
            className="w-full rounded-2xl border border-input bg-secondary px-4 py-3 text-base outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
          />

          {error && (
            <p role="alert" className="mt-4 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {t(
                error === 'invalidCredentials'
                  ? 'auth.invalidCredentials'
                  : 'auth.genericError',
              )}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !email.trim() || !password}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground transition-opacity active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <LogIn className="size-4" />
            {isSubmitting ? t('auth.submitting') : t('auth.submit')}
          </button>
        </form>

        <p className="mt-5 flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
          <LockKeyhole className="size-3.5" /> {t('auth.restricted')}
        </p>
      </div>
    </main>
  )
}
