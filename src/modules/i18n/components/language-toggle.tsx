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
      className="surface-card flex size-11 shrink-0 items-center justify-center gap-1 rounded-2xl border border-border bg-card/90 text-xs font-bold uppercase text-foreground transition-all hover:border-info/25 hover:bg-info-soft active:scale-95"
    >
      <Languages className="size-4 text-info" />
      {nextLocale}
    </button>
  )
}
