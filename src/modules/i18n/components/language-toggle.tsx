'use client'

import { Languages } from 'lucide-react'

import { useI18n } from '../hooks/use-i18n'

export function LanguageToggle() {
  const { locale, setLocale, t } = useI18n()
  const nextLocale = locale === 'en' ? 'pl' : 'en'
  const label = t(
    nextLocale === 'pl'
      ? 'language.switchToPolish'
      : 'language.switchToEnglish',
  )

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => setLocale(nextLocale)}
      className="flex size-11 shrink-0 items-center justify-center gap-1 rounded-2xl border border-border bg-card text-xs font-bold uppercase text-foreground shadow-sm transition-transform active:scale-95"
    >
      <Languages className="size-4" />
      {nextLocale}
    </button>
  )
}
