'use client'

import { AlertCircle, LoaderCircle } from 'lucide-react'

import { useI18n } from '@/src/modules/i18n'

export function AppLoading() {
  const { t } = useI18n()

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background text-foreground">
      <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
        <LoaderCircle className="size-6 animate-spin text-primary" />
        {t('feedback.loading')}
      </div>
    </main>
  )
}

export function DataErrorBanner({ message }: { message: string }) {
  const { t } = useI18n()

  return (
    <div className="fixed inset-x-4 top-4 z-50 mx-auto flex max-w-md items-center gap-2 rounded-2xl border border-destructive/20 bg-background/95 px-4 py-3 text-sm text-destructive shadow-lg backdrop-blur-xl">
      <AlertCircle className="size-4 shrink-0" />
      <span>{t('feedback.dataError', { message })}</span>
    </div>
  )
}
