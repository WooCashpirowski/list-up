'use client';

import { Eye, EyeOff, ListChecks, LockKeyhole, LogIn } from 'lucide-react';
import { useState } from 'react';

import { ThemeToggle } from '@/components/theme-toggle';
import { getErrorMessage } from '@/src/lib/get-error-message';
import { LanguageToggle, useI18n } from '@/src/modules/i18n';

import type { SignInInput } from '../types/auth.types';

type LoginViewProps = {
    onSignIn: (input: SignInInput) => Promise<void>;
};

export function LoginView({ onSignIn }: LoginViewProps) {
    const { t } = useI18n();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<'invalidCredentials' | 'generic' | null>(
        null,
    );

    async function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!email.trim() || !password) return;

        setIsSubmitting(true);
        setError(null);

        try {
            await onSignIn({ email: email.trim(), password });
        } catch (nextError) {
            const message = getErrorMessage(nextError).toLocaleLowerCase();
            setError(
                message.includes('invalid login credentials')
                    ? 'invalidCredentials'
                    : 'generic',
            );
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <main className='app-canvas min-h-dvh px-5 text-foreground'>
            <div className='mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center py-10'>
                <div className='absolute right-5 top-5 flex gap-2'>
                    <LanguageToggle />
                    <ThemeToggle />
                </div>

                <div className='mb-8'>
                    <span className='brand-mark mb-5 flex size-16 items-center justify-center rounded-3xl text-primary-foreground'>
                        <ListChecks
                            className='size-7'
                            strokeWidth={2.2}
                            aria-hidden='true'
                        />
                    </span>
                    <p className='text-sm font-semibold text-primary'>
                        {t('auth.eyebrow')}
                    </p>
                    <h1 className='mt-1 text-4xl font-semibold tracking-tight'>
                        {t('auth.title')}
                    </h1>
                    <p className='mt-3 max-w-sm text-sm leading-6 text-muted-foreground'>
                        {t('auth.description')}
                    </p>
                </div>

                <form
                    onSubmit={submit}
                    className='surface-card rounded-3xl border border-border bg-card/95 p-5 backdrop-blur-sm'
                >
                    <label
                        htmlFor='email'
                        className='mb-2 block text-sm font-semibold'
                    >
                        {t('auth.email')}
                    </label>
                    <input
                        id='email'
                        type='email'
                        autoComplete='email'
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder={t('auth.emailPlaceholder')}
                        className='w-full rounded-2xl border border-input bg-secondary px-4 py-3 text-base outline-none transition-colors placeholder:text-muted-foreground focus:border-primary'
                    />

                    <label
                        htmlFor='password'
                        className='mb-2 mt-4 block text-sm font-semibold'
                    >
                        {t('auth.password')}
                    </label>
                    <div className='relative'>
                        <input
                            id='password'
                            type={showPassword ? 'text' : 'password'}
                            autoComplete='current-password'
                            value={password}
                            onChange={(event) =>
                                setPassword(event.target.value)
                            }
                            placeholder={t('auth.passwordPlaceholder')}
                            className='w-full rounded-2xl border border-input bg-secondary py-3 pl-4 pr-14 text-base outline-none transition-colors placeholder:text-muted-foreground focus:border-primary'
                        />
                        <button
                            type='button'
                            onClick={() =>
                                setShowPassword((current) => !current)
                            }
                            aria-label={t(
                                showPassword
                                    ? 'auth.hidePassword'
                                    : 'auth.showPassword',
                            )}
                            aria-controls='password'
                            className='absolute right-1 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                        >
                            {showPassword ? (
                                <EyeOff className='size-5' aria-hidden='true' />
                            ) : (
                                <Eye className='size-5' aria-hidden='true' />
                            )}
                        </button>
                    </div>

                    {error && (
                        <p
                            role='alert'
                            className='mt-4 rounded-2xl border border-destructive/20 bg-destructive-soft px-4 py-3 text-sm text-destructive'
                        >
                            {t(
                                error === 'invalidCredentials'
                                    ? 'auth.invalidCredentials'
                                    : 'auth.genericError',
                            )}
                        </p>
                    )}

                    <button
                        type='submit'
                        disabled={isSubmitting || !email.trim() || !password}
                        className='primary-action mt-5 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold text-primary-foreground transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50'
                    >
                        <LogIn className='size-4' />
                        {isSubmitting ? t('auth.submitting') : t('auth.submit')}
                    </button>
                </form>

                <p className='mt-5 flex items-center justify-center gap-2 text-center text-xs text-muted-foreground'>
                    <LockKeyhole className='size-3.5' /> {t('auth.restricted')}
                </p>
            </div>
        </main>
    );
}
