"use client"

import { Home, LayoutGrid, LogOut } from "lucide-react"

export type Tab = "home" | "categories"

export function BottomNav({
  active,
  onChange,
  onLogout,
}: {
  active: Tab
  onChange: (tab: Tab) => void
  onLogout: () => void
}) {
  const tabs: { id: Tab; label: string; icon: typeof Home }[] = [
    { id: "home", label: "Home", icon: Home },
    { id: "categories", label: "Categories", icon: LayoutGrid },
  ]

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md">
      <div className="mx-4 mb-4 flex items-center justify-around rounded-3xl border border-border bg-card/90 px-2 py-2 shadow-lg backdrop-blur-xl">
        {tabs.map((t) => {
          const Icon = t.icon
          const isActive = active === t.id
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              className={`flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2 text-xs font-medium transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon className="size-6" strokeWidth={isActive ? 2.4 : 2} />
              {t.label}
            </button>
          )
        })}
        <button
          onClick={onLogout}
          className="flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2 text-xs font-medium text-muted-foreground transition-colors active:text-destructive"
        >
          <LogOut className="size-6" strokeWidth={2} />
          Logout
        </button>
      </div>
    </nav>
  )
}
