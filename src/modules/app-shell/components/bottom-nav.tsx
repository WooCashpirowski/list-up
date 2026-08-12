'use client'

import { Home, LayoutGrid, LogOut } from 'lucide-react'

import { cn } from '@/lib/utils'
import { useI18n } from '@/src/modules/i18n'

export type AppTab = 'home' | 'categories'

type BottomNavProps = {
  active: AppTab
  onChange: (tab: AppTab) => void
  onLogout: () => void
}

export function BottomNav({ active, onChange, onLogout }: BottomNavProps) {
  const { t } = useI18n()
  const tabs: { id: AppTab; label: string; icon: typeof Home }[] = [
    { id: 'home', label: t('nav.home'), icon: Home },
    { id: 'categories', label: t('nav.categories'), icon: LayoutGrid },
  ]

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md"
      aria-label={t('nav.main')}
    >
      <div className="surface-glass mx-4 mb-4 flex items-center justify-around rounded-3xl border border-border bg-card/82 px-2 py-2 backdrop-blur-xl">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = active === tab.id

          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2 text-xs font-medium transition-all',
                isActive
                  ? 'bg-primary/12 text-primary shadow-[inset_0_1px_0_oklch(1_0_0/12%)]'
                  : 'text-muted-foreground hover:bg-accent/45 hover:text-foreground',
              )}
            >
              <Icon className="size-6" strokeWidth={isActive ? 2.4 : 2} />
              {tab.label}
            </button>
          )
        })}
        <button
          onClick={onLogout}
          className="flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-destructive-soft hover:text-destructive active:text-destructive"
        >
          <LogOut className="size-6" strokeWidth={2} />
          {t('nav.logout')}
        </button>
      </div>
    </nav>
  )
}
