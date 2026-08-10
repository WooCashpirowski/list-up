"use client"

import { useSyncExternalStore } from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { useI18n } from "@/src/modules/i18n"

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const { t } = useI18n()
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  )

  const isDark = resolvedTheme === "dark"

  return (
    <button
      type="button"
      aria-label={isDark ? t('theme.switchToLight') : t('theme.switchToDark')}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="surface-card flex size-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-card/90 transition-all hover:border-primary/25 hover:bg-accent/70 active:scale-95"
    >
      {mounted && isDark ? (
        <Sun className="size-5 text-warning" strokeWidth={2.2} />
      ) : (
        <Moon className="size-5 text-todo" strokeWidth={2.2} />
      )}
    </button>
  )
}
