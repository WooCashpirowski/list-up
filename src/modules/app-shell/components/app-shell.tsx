'use client'

import { useEffect, useMemo } from 'react'

import { AuthProvider, LoginView, useAuth } from '@/src/modules/auth'
import { CategoriesView, useCategories } from '@/src/modules/categories'
import { ChatInboxView, ChatView, useChat, useChatInbox } from '@/src/modules/chat'
import { I18nProvider } from '@/src/modules/i18n'
import { ListView, useItemComposer, useListItems } from '@/src/modules/list-items'
import { HomeView, useLists } from '@/src/modules/lists'
import { usePushNotifications } from '@/src/modules/notifications'
import { OfflineStatus, useOfflineSync } from '@/src/modules/offline'
import { useProfiles } from '@/src/modules/profiles'

import { useAppNavigation } from '../hooks'
import { AppLoading, DataErrorBanner } from './app-feedback'
import { BottomNav } from './bottom-nav'

function AuthenticatedApp({ userId }: { userId: string }) {
  const { signOut } = useAuth()
  const {
    tab,
    listId: openListId,
    conversationId,
    openList: navigateToList,
    openConversation: navigateToConversation,
    selectTab,
    backToLists,
    replaceWithLists,
    backToChatInbox,
    replaceWithChatInbox,
  } = useAppNavigation()
  const listsState = useLists(userId)
  const categoriesState = useCategories(userId)
  const itemsState = useListItems(userId)
  const offlineState = useOfflineSync(userId)
  const profilesState = useProfiles(userId)
  const chatInboxState = useChatInbox(userId)
  const chatState = useChat(
    userId,
    conversationId,
    tab === 'chat' && conversationId !== null,
    chatInboxState.refresh,
  )
  const pushState = usePushNotifications(userId)

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
  const currentProfile = useMemo(
    () => profilesState.profiles.find(({ id }) => id === userId) ?? null,
    [profilesState.profiles, userId],
  )
  const selectedConversation = useMemo(
    () =>
      chatInboxState.conversations.find(
        (conversation) => conversation.conversation_id === conversationId,
      ) ?? null,
    [chatInboxState.conversations, conversationId],
  )

  const isLoading =
    listsState.isLoading || categoriesState.isLoading || itemsState.isLoading
  const error =
    listsState.error ??
    categoriesState.error ??
    itemsState.error ??
    profilesState.error ??
    chatInboxState.error

  const handleLogout = async () => {
    try {
      await pushState.cleanupBeforeSignOut()
    } finally {
      await signOut()
    }
  }

  useEffect(() => {
    if (!listsState.isLoading && openListId && !openList) replaceWithLists()
  }, [listsState.isLoading, openList, openListId, replaceWithLists])

  useEffect(() => {
    if (
      !chatInboxState.isLoading &&
      conversationId &&
      !selectedConversation
    ) {
      replaceWithChatInbox()
    }
  }, [
    chatInboxState.isLoading,
    conversationId,
    selectedConversation,
    replaceWithChatInbox,
  ])

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

      {tab === 'chat' && (
        selectedConversation ? (
          <ChatView
            currentUserId={userId}
            currentProfile={currentProfile}
            peer={{
              id: selectedConversation.peer_id,
              email: selectedConversation.peer_email,
              display_name: selectedConversation.peer_display_name,
            }}
            messages={chatState.messages}
            isLoading={chatState.isLoading}
            isLoadingOlder={chatState.isLoadingOlder}
            hasOlder={chatState.hasOlder}
            error={chatState.error}
            isPeerTyping={chatState.isPeerTyping}
            push={pushState}
            onSendMessage={chatState.sendMessage}
            onRetryMessage={chatState.retryMessage}
            onLoadOlder={chatState.loadOlder}
            onMarkReadThrough={chatState.markReadThrough}
            onTypingChange={chatState.setTyping}
            onUpdateDisplayName={profilesState.updateDisplayName}
            onBack={backToChatInbox}
          />
        ) : (
          <ChatInboxView
            currentUserId={userId}
            currentProfile={currentProfile}
            conversations={chatInboxState.conversations}
            isLoading={chatInboxState.isLoading}
            error={chatInboxState.error}
            push={pushState}
            onOpenConversation={navigateToConversation}
            onUpdateDisplayName={profilesState.updateDisplayName}
          />
        )
      )}

      {!inList && (
        <BottomNav
          active={tab}
          onChange={selectTab}
          unreadChatCount={chatInboxState.unreadCount}
          onLogout={() => void handleLogout()}
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
