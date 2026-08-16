'use client'

import { useCallback, useSyncExternalStore } from 'react'

import type { AppTab } from '../types'

const APP_NAVIGATION_EVENT = 'list-up:navigation'
const APP_HISTORY_STATE_KEY = 'listUpNavigation'

type AppHistoryState = {
  parent: 'home'
}

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener('popstate', onStoreChange)
  window.addEventListener(APP_NAVIGATION_EVENT, onStoreChange)

  return () => {
    window.removeEventListener('popstate', onStoreChange)
    window.removeEventListener(APP_NAVIGATION_EVENT, onStoreChange)
  }
}

function getSnapshot(): string {
  return window.location.search
}

function getServerSnapshot(): string {
  return ''
}

function getHistoryState(): Record<string, unknown> {
  const state: unknown = window.history.state
  return state !== null && typeof state === 'object' ? { ...state } : {}
}

function updateUrl(
  search: string,
  mode: 'push' | 'replace',
  appState?: AppHistoryState,
): void {
  const state = getHistoryState()

  if (appState) state[APP_HISTORY_STATE_KEY] = appState
  else delete state[APP_HISTORY_STATE_KEY]

  const url = `${window.location.pathname}${search}`
  if (mode === 'push') window.history.pushState(state, '', url)
  else window.history.replaceState(state, '', url)

  window.dispatchEvent(new Event(APP_NAVIGATION_EVENT))
}

function getAppHistoryState(): AppHistoryState | null {
  const state: unknown = window.history.state?.[APP_HISTORY_STATE_KEY]
  if (state === null || typeof state !== 'object') return null

  return 'parent' in state && state.parent === 'home'
    ? { parent: 'home' }
    : null
}

export function useAppNavigation() {
  const search = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const searchParams = new URLSearchParams(search)
  const listId = searchParams.get('list')?.trim() || null
  const tab: AppTab =
    !listId && searchParams.get('view') === 'categories'
      ? 'categories'
      : 'home'

  const openList = useCallback((id: string) => {
    const nextSearch = `?${new URLSearchParams({ list: id }).toString()}`
    if (window.location.search === nextSearch) return

    updateUrl(nextSearch, 'push', { parent: 'home' })
  }, [])

  const selectTab = useCallback((nextTab: AppTab) => {
    const nextSearch =
      nextTab === 'categories'
        ? `?${new URLSearchParams({ view: 'categories' }).toString()}`
        : ''

    if (window.location.search === nextSearch) return
    updateUrl(nextSearch, 'push')
  }, [])

  const backToLists = useCallback(() => {
    if (getAppHistoryState()?.parent === 'home') {
      window.history.back()
      return
    }

    updateUrl('', 'replace')
  }, [])

  const replaceWithLists = useCallback(() => {
    if (window.location.search === '') return
    updateUrl('', 'replace')
  }, [])

  return {
    tab,
    listId,
    openList,
    selectTab,
    backToLists,
    replaceWithLists,
  }
}
