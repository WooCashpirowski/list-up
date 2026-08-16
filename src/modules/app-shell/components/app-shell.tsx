'use client'

import { useEffect, useMemo } from 'react'

import { AuthProvider, LoginView, useAuth } from '@/src/modules/auth'
import { CategoriesView, useCategories } from '@/src/modules/categories'
import { I18nProvider } from '@/src/modules/i18n'
import { ListView, useItemComposer, useListItems } from '@/src/modules/list-items'
import { HomeView, useLists } from '@/src/modules/lists'
import { OfflineStatus, useOfflineSync } from '@/src/modules/offline'

import { useAppNavigation } from '../hooks'
import { AppLoading, DataErrorBanner } from './app-feedback'
import { BottomNav } from './bottom-nav'

function AuthenticatedApp({ userId }: { userId: string }) {
  const { signOut } = useAuth()
  const {
    tab,
    listId: openListId,
    openList: navigateToList,
    selectTab,
    backToLists,
    replaceWithLists,
  } = useAppNavigation()
  const listsState = useLists(userId)
  const categoriesState = useCategories(userId)
  const itemsState = useListItems(userId)
  const offlineState = useOfflineSync(userId)

  const openList = useMemo(
    () => listsState.lists.find(({ id }) => id === openListId) ?? null,
    [listsState.lists, openListId],
  )
  const activeListId = listsState.isLoading || openList ? openListId : null
  const openListItems = useMemo(
    () => itemsState.items.filter(({ list_id }) => list_id === activeListId),
    [activeListId, itemsState.items],
  )
  const composer = useItemComposer({
    listId: activeListId,
    categories: categoriesState.categories,
    addItem: itemsState.addItem,
    updateCategory: categoriesState.updateCategory,
  })

  const isLoading =
    listsState.isLoading || categoriesState.isLoading || itemsState.isLoading
  const error = listsState.error ?? categoriesState.error ?? itemsState.error

  useEffect(() => {
    if (!listsState.isLoading && openListId && !openList) replaceWithLists()
  }, [listsState.isLoading, openList, openListId, replaceWithLists])

  if (isLoading) return <AppLoading />

  const inList = tab === 'home' && openList !== null

  return (
    <main className="app-canvas min-h-dvh text-foreground">
      {error && <DataErrorBanner message={error} />}
      <OfflineStatus state={offlineState} />

      {tab === 'home' &&
        (openList ? (
          <ListView
            list={openList}
            categories={categoriesState.categories}
            items={openListItems}
            pendingItem={composer.pendingItem}
            onBack={backToLists}
            onSubmitItem={composer.submitItem}
            onAssignPendingItem={composer.assignPendingItem}
            onKeepPendingItemUncategorized={composer.keepPendingItemUncategorized}
            onCancelPendingItem={composer.cancelPendingItem}
            onToggleItem={itemsState.toggleItem}
            onDeleteItem={itemsState.deleteItem}
            onClearItems={itemsState.clearItems}
          />
        ) : (
          <HomeView
            lists={listsState.lists}
            items={itemsState.items}
            onOpenList={navigateToList}
            onCreateList={listsState.createList}
            onRenameList={listsState.renameList}
            onDeleteList={listsState.deleteList}
          />
        ))}

      {tab === 'categories' && (
        <CategoriesView
          categories={categoriesState.categories}
          items={itemsState.items}
          onCreateCategory={categoriesState.createCategory}
          onSaveCategory={categoriesState.saveCategory}
          onDeleteCategory={categoriesState.deleteCategory}
        />
      )}

      {!inList && (
        <BottomNav
          active={tab}
          onChange={selectTab}
          onLogout={() => void signOut()}
        />
      )}
    </main>
  )
}

function AppGate() {
  const { status, user, signIn } = useAuth()

  if (status === 'loading') return <AppLoading />
  if (!user) return <LoginView onSignIn={signIn} />

  return <AuthenticatedApp userId={user.id} />
}

export function AppShell() {
  return (
    <I18nProvider>
      <AuthProvider>
        <AppGate />
      </AuthProvider>
    </I18nProvider>
  )
}
