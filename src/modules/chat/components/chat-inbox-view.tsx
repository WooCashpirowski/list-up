'use client'

import { ChevronRight, MessageCircle, Settings } from 'lucide-react'
import { useMemo, useState } from 'react'

import { ThemeToggle } from '@/components/theme-toggle'
import { LanguageToggle, useI18n } from '@/src/modules/i18n'
import type { PushNotificationState } from '@/src/modules/notifications'
import { getProfileDisplayName } from '@/src/modules/profiles'

import type { ChatConversationSummary } from '../types/chat.types'
import { ChatSettings, type ChatParticipant } from './chat-view'

type ChatInboxViewProps = {
  currentUserId: string
  currentProfile: ChatParticipant | null
  conversations: ChatConversationSummary[]
  isLoading: boolean
  error: string | null
  push: PushNotificationState
  onOpenConversation: (conversationId: string) => void
  onUpdateDisplayName: (displayName: string) => Promise<boolean>
}

export function ChatInboxView({
  currentUserId,
  currentProfile,
  conversations,
  isLoading,
  error,
  push,
  onOpenConversation,
  onUpdateDisplayName,
}: ChatInboxViewProps) {
  const { locale, t } = useI18n()
  const [showSettings, setShowSettings] = useState(false)
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }),
    [locale],
  )

  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col pb-28">
      <header className="surface-glass sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-card/82 px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-3">
          <span className="brand-mark flex size-11 shrink-0 items-center justify-center rounded-2xl text-primary-foreground">
            <MessageCircle className="size-6" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">{t('chat.title')}</h1>
            <p className="truncate text-xs text-muted-foreground">
              {t('chat.inboxDescription')}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            aria-label={t('chat.settings')}
            className="surface-card flex size-11 items-center justify-center rounded-2xl border border-border bg-card/90"
          >
            <Settings className="size-5 text-muted-foreground" />
          </button>
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </header>

      <section className="flex-1 px-4 py-4" aria-label={t('chat.conversations')}>
        {error && (
          <p role="alert" className="mb-3 text-sm text-destructive">
            {error}
          </p>
        )}

        {isLoading && conversations.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {t('chat.loadingConversations')}
          </p>
        ) : conversations.length === 0 ? (
          <div className="flex min-h-80 flex-col items-center justify-center px-8 text-center">
            <MessageCircle className="size-10 text-primary/55" />
            <p className="mt-3 font-semibold">{t('chat.noConversations')}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('chat.noConversationsDescription')}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {conversations.map((conversation) => {
              const peerName = conversation.peer_alias ?? getProfileDisplayName({
                email: conversation.peer_email,
                display_name: conversation.peer_display_name,
              })
              const ownPrefix = conversation.last_message_sender_id === currentUserId
                ? `${t('chat.you')}: ` : ''
              const preview = conversation.last_message_kind === 'photo'
                ? `${ownPrefix}${t('chat.photo')}`
                : conversation.last_message_kind === 'gif'
                  ? `${ownPrefix}${t('chat.gif')}`
                  : conversation.last_message_body
                ? `${ownPrefix}${conversation.last_message_body}`
                : t('chat.startConversation')

              return (
                <button
                  key={conversation.conversation_id}
                  type="button"
                  onClick={() =>
                    onOpenConversation(conversation.conversation_id)
                  }
                  aria-label={t('chat.openConversation', { name: peerName })}
                  className="surface-card flex w-full items-center gap-3 rounded-3xl border border-border bg-card/95 p-4 text-left transition-colors hover:bg-accent/45"
                >
                  <span className="brand-mark flex size-12 shrink-0 items-center justify-center rounded-2xl text-lg font-semibold text-primary-foreground">
                    {peerName.slice(0, 1).toLocaleUpperCase(locale)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className="truncate font-semibold">{peerName}</span>
                      {conversation.last_message_created_at && (
                        <time
                          className="shrink-0 text-[11px] text-muted-foreground"
                          dateTime={conversation.last_message_created_at}
                        >
                          {dateFormatter.format(
                            new Date(conversation.last_message_created_at),
                          )}
                        </time>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {conversation.peer_email}
                    </span>
                    <span className="mt-1 flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                        {preview}
                      </span>
                      {conversation.unread_count > 0 && (
                        <span
                          className="flex min-w-6 shrink-0 items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-xs font-semibold text-destructive-foreground"
                          aria-label={t('chat.conversationUnread', {
                            count: conversation.unread_count,
                          })}
                        >
                          {conversation.unread_count}
                        </span>
                      )}
                    </span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                </button>
              )
            })}
          </div>
        )}
      </section>

      {showSettings && (
        <ChatSettings
          currentProfile={currentProfile}
          push={push}
          onClose={() => setShowSettings(false)}
          onUpdateDisplayName={onUpdateDisplayName}
        />
      )}
    </div>
  )
}
