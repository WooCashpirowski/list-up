'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react'

import { translate, type TranslationKey } from '../services/translations'
import type { Locale, TranslationParameters } from '../types/i18n.types'

const STORAGE_KEY = 'nest.locale'
const LOCALE_EVENT = 'nest:locale-change'

type I18nContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: TranslationKey, parameters?: TranslationParameters) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

function isLocale(value: string | null): value is Locale {
  return value === 'en' || value === 'pl'
}

function getBrowserLocale(): Locale {
  try {
    const storedLocale = window.localStorage.getItem(STORAGE_KEY)
    if (isLocale(storedLocale)) return storedLocale
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }

  return window.navigator.language.toLocaleLowerCase().startsWith('pl')
    ? 'pl'
    : 'en'
}

function subscribeToLocale(onStoreChange: () => void): () => void {
  window.addEventListener('storage', onStoreChange)
  window.addEventListener(LOCALE_EVENT, onStoreChange)

  return () => {
    window.removeEventListener('storage', onStoreChange)
    window.removeEventListener(LOCALE_EVENT, onStoreChange)
  }
}

function storeLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // The language still changes for the current document without persistence.
  }

  window.dispatchEvent(new Event(LOCALE_EVENT))
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const locale = useSyncExternalStore<Locale>(
    subscribeToLocale,
    getBrowserLocale,
    () => 'en',
  )

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const setLocale = useCallback((nextLocale: Locale) => storeLocale(nextLocale), [])
  const t = useCallback(
    (key: TranslationKey, parameters?: TranslationParameters) =>
      translate(locale, key, parameters),
    [locale],
  )
  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext)

  if (!context) {
    throw new Error('useI18n must be used within I18nProvider')
  }

  return context
}
