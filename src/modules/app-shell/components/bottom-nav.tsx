'use client'

import { Home, Languages, LayoutGrid, LogOut } from 'lucide-react'

import { useI18n } from '@/src/modules/i18n'

export type AppTab = 'home' | 'categories'

type BottomNavProps = {
  active: AppTab
  onChange: (tab: AppTab) => void
  onLogout: () => void
}

export function BottomNav({ active, onChange, onLogout }: BottomNavProps) {
  const { locale, setLocale, t } = useI18n()
  const nextLocale = locale === 'en' ? 'pl' : 'en'
  const tabs: { id: AppTab; label: string; icon: typeof Home }[] = [
    { id: 'home', label: t('nav.home'), icon: Home },
    { id: 'categories', label: t('nav.categories'), icon: LayoutGrid },
  ]

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md"
      aria-label={t('nav.main')}
    >
      <div className="mx-4 mb-4 flex items-center justify-around rounded-3xl border border-border bg-card/90 px-2 py-2 shadow-lg backdrop-blur-xl">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = active === tab.id

          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2 text-xs font-medium transition-colors ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <Icon className="size-6" strokeWidth={isActive ? 2.4 : 2} />
              {tab.label}
            </button>
          )
        })}
        <button
          onClick={() => setLocale(nextLocale)}
          aria-label={t(
            nextLocale === 'pl'
              ? 'language.switchToPolish'
              : 'language.switchToEnglish',
          )}
          className="flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2 text-xs font-medium uppercase text-muted-foreground transition-colors active:text-primary"
        >
          <Languages className="size-6" strokeWidth={2} />
          {nextLocale}
        </button>
        <button
          onClick={onLogout}
          className="flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2 text-xs font-medium text-muted-foreground transition-colors active:text-destructive"
        >
          <LogOut className="size-6" strokeWidth={2} />
          {t('nav.logout')}
        </button>
      </div>
    </nav>
  )
}
