'use client'

import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  Clock3,
  LoaderCircle,
  MessageCircle,
  RefreshCw,
  Send,
  Settings,
  X,
} from 'lucide-react'
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { ThemeToggle } from '@/components/theme-toggle'
import { cn } from '@/lib/utils'
import { LanguageToggle, useI18n } from '@/src/modules/i18n'
import type { PushNotificationState } from '@/src/modules/notifications'
import { getProfileDisplayName } from '@/src/modules/profiles'

import { getLatestIncomingSequence } from '../model/chat-messages'
import type { ChatMessage } from '../types/chat.types'

type ChatParticipant = {
  id: string
  email: string
  display_name: string
}

type ChatViewProps = {
  currentUserId: string
  profiles: ChatParticipant[]
  messages: ChatMessage[]
  isLoading: boolean
  isLoadingOlder: boolean
  hasOlder: boolean
  error: string | null
  push: PushNotificationState
  onSendMessage: (body: string) => Promise<boolean>
  onRetryMessage: (id: string) => Promise<void>
  onLoadOlder: () => Promise<void>
  onMarkReadThrough: (sequence: number) => Promise<void>
  onUpdateDisplayName: (displayName: string) => Promise<boolean>
}

type MessageBubbleProps = {
  message: ChatMessage
  own: boolean
  senderName: string
  time: string
  isLatestIncoming: boolean
  latestIncomingRef: React.RefObject<HTMLDivElement | null>
  retryLabel: string
  onRetry: (id: string) => void
}

const MessageBubble = memo(function MessageBubble({
  message,
  own,
  senderName,
  time,
  isLatestIncoming,
  latestIncomingRef,
  retryLabel,
  onRetry,
}: MessageBubbleProps) {
  return (
    <div
      ref={isLatestIncoming ? latestIncomingRef : undefined}
      className={cn('flex', own ? 'justify-end' : 'justify-start')}
      data-message-sequence={message.sequence ?? undefined}
    >
      <article
        className={cn(
          'surface-card max-w-[82%] rounded-3xl px-4 py-2.5',
          own
            ? 'rounded-br-lg bg-primary text-primary-foreground'
            : 'rounded-bl-lg border border-border bg-card/95 text-card-foreground',
        )}
      >
        {!own && (
          <p className="mb-1 text-xs font-semibold text-primary">{senderName}</p>
        )}
        <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
          {message.body}
        </p>
        <div
          className={cn(
            'mt-1 flex items-center justify-end gap-1 text-[11px]',
            own ? 'text-primary-foreground/72' : 'text-muted-foreground',
          )}
        >
          <time dateTime={message.created_at}>{time}</time>
          {own && message.delivery_status === 'sent' && (
            <CheckCheck className="size-3.5" aria-label="sent" />
          )}
          {own && message.delivery_status === 'sending' && (
            <LoaderCircle className="size-3.5 animate-spin" aria-label="sending" />
          )}
          {own && message.delivery_status === 'queued' && (
            <Clock3 className="size-3.5" aria-label="queued" />
          )}
          {own && message.delivery_status === 'failed' && (
            <button
              type="button"
              onClick={() => onRetry(message.id)}
              aria-label={retryLabel}
              className="ml-1 inline-flex items-center gap-1 rounded-full bg-black/10 px-1.5 py-0.5 font-semibold"
            >
              <RefreshCw className="size-3" />
              {retryLabel}
            </button>
          )}
        </div>
      </article>
    </div>
  )
})

function dateKey(value: string): string {
  const date = new Date(value)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

export function ChatView({
  currentUserId,
  profiles,
  messages,
  isLoading,
  isLoadingOlder,
  hasOlder,
  error,
  push,
  onSendMessage,
  onRetryMessage,
  onLoadOlder,
  onMarkReadThrough,
  onUpdateDisplayName,
}: ChatViewProps) {
  const { locale, t } = useI18n()
  const [draft, setDraft] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [showNewMessages, setShowNewMessages] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const latestIncomingRef = useRef<HTMLDivElement>(null)
  const nearBottomRef = useRef(true)
  const previousMessageCountRef = useRef(0)
  const previousFirstMessageIdRef = useRef<string | null>(null)
  const previousLastMessageIdRef = useRef<string | null>(null)
  const previousScrollHeightRef = useRef(0)
  const latestIncomingSequence = useMemo(
    () => getLatestIncomingSequence(messages, currentUserId),
    [currentUserId, messages],
  )
  const names = useMemo(
    () =>
      new Map(
        profiles.map((profile) => [profile.id, getProfileDisplayName(profile)]),
      ),
    [profiles],
  )

  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
      }),
    [locale],
  )
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }),
    [locale],
  )

  useLayoutEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const previousCount = previousMessageCountRef.current
    const countGrew = messages.length > previousCount
    const firstMessageId = messages[0]?.id ?? null
    const lastMessageId = messages.at(-1)?.id ?? null
    const prependedMessages =
      countGrew &&
      previousFirstMessageIdRef.current !== null &&
      firstMessageId !== previousFirstMessageIdRef.current
    const appendedMessages =
      countGrew &&
      previousLastMessageIdRef.current !== null &&
      lastMessageId !== previousLastMessageIdRef.current

    if (prependedMessages) {
      container.scrollTop += Math.max(
        0,
        container.scrollHeight - previousScrollHeightRef.current,
      )
      if (appendedMessages && !nearBottomRef.current) setShowNewMessages(true)
    } else if (previousCount === 0 || (appendedMessages && nearBottomRef.current)) {
      container.scrollTop = container.scrollHeight
      setShowNewMessages(false)
    } else if (appendedMessages) {
      setShowNewMessages(true)
    }

    previousMessageCountRef.current = messages.length
    previousFirstMessageIdRef.current = firstMessageId
    previousLastMessageIdRef.current = lastMessageId
    previousScrollHeightRef.current = container.scrollHeight
  }, [messages])

  useEffect(() => {
    const target = latestIncomingRef.current
    if (!target || latestIncomingSequence === null) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some(({ isIntersecting }) => isIntersecting)) {
          void onMarkReadThrough(latestIncomingSequence)
        }
      },
      { threshold: 0.7 },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [latestIncomingSequence, onMarkReadThrough])

  const handleScroll = useCallback(() => {
    const container = scrollRef.current
    if (!container) return
    nearBottomRef.current =
      container.scrollHeight - container.scrollTop - container.clientHeight < 80
    if (nearBottomRef.current) setShowNewMessages(false)
  }, [])

  const submit = useCallback(async () => {
    if (!draft.trim()) return
    const body = draft
    setDraft('')
    const sent = await onSendMessage(body)
    if (!sent) setDraft(body)
    nearBottomRef.current = true
  }, [draft, onSendMessage])

  return (
    <div className="relative mx-auto flex h-dvh w-full max-w-md flex-col">
      <header className="surface-glass z-20 flex items-center justify-between gap-3 border-b border-border bg-card/82 px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-3">
          <span className="brand-mark flex size-11 shrink-0 items-center justify-center rounded-2xl text-primary-foreground">
            <MessageCircle className="size-6" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">{t('chat.title')}</h1>
            <p className="truncate text-xs text-muted-foreground">
              {t('chat.description')}
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

      {push.shouldShowOnboarding && (
        <section className="mx-4 mt-3 flex items-start gap-3 rounded-2xl border border-info/25 bg-info-soft p-3 text-info">
          <Bell className="mt-0.5 size-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{t('chat.pushTitle')}</p>
            <p className="mt-0.5 text-xs leading-relaxed">{t('chat.pushDescription')}</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                disabled={push.isBusy}
                onClick={() => void push.enable()}
                className="rounded-xl bg-info px-3 py-1.5 text-xs font-semibold text-info-foreground disabled:opacity-50"
              >
                {t('chat.pushEnable')}
              </button>
              <button
                type="button"
                onClick={push.dismissOnboarding}
                className="rounded-xl px-3 py-1.5 text-xs font-semibold"
              >
                {t('chat.pushLater')}
              </button>
            </div>
          </div>
        </section>
      )}

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
        aria-label={t('chat.messages')}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
      >
        {hasOlder && messages.some(({ sequence }) => sequence !== null) && (
          <div className="mb-4 text-center">
            <button
              type="button"
              disabled={isLoadingOlder}
              onClick={() => void onLoadOlder()}
              className="rounded-full border border-border bg-card/80 px-4 py-2 text-xs font-semibold text-muted-foreground disabled:opacity-50"
            >
              {isLoadingOlder ? t('chat.loadingOlder') : t('chat.loadOlder')}
            </button>
          </div>
        )}

        {isLoading && messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <LoaderCircle className="size-6 animate-spin" aria-label={t('chat.loading')} />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-8 text-center">
            <MessageCircle className="size-10 text-primary/55" />
            <p className="mt-3 font-semibold">{t('chat.empty')}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t('chat.emptyDescription')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map((message, index) => {
              const previous = messages[index - 1]
              const showDate =
                !previous || dateKey(previous.created_at) !== dateKey(message.created_at)
              const own = message.sender_id === currentUserId

              return (
                <div key={message.id}>
                  {showDate && (
                    <div className="my-4 flex items-center gap-3" aria-hidden="true">
                      <span className="h-px flex-1 bg-border/70" />
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {dateFormatter.format(new Date(message.created_at))}
                      </span>
                      <span className="h-px flex-1 bg-border/70" />
                    </div>
                  )}
                  <MessageBubble
                    message={message}
                    own={own}
                    senderName={names.get(message.sender_id) ?? t('chat.otherPerson')}
                    time={timeFormatter.format(new Date(message.created_at))}
                    isLatestIncoming={message.sequence === latestIncomingSequence}
                    latestIncomingRef={latestIncomingRef}
                    retryLabel={t('chat.retry')}
                    onRetry={onRetryMessage}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showNewMessages && (
        <button
          type="button"
          onClick={() => {
            const container = scrollRef.current
            if (container) container.scrollTop = container.scrollHeight
            nearBottomRef.current = true
            setShowNewMessages(false)
          }}
          className="surface-card absolute bottom-40 left-1/2 z-20 -translate-x-1/2 rounded-full border border-primary/25 bg-card px-4 py-2 text-xs font-semibold text-primary"
        >
          {t('chat.newMessages')}
        </button>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
        className="surface-glass z-20 border-t border-border bg-card/88 px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl"
      >
        {error && <p className="mb-2 text-xs text-destructive">{error}</p>}
        <div className="flex items-end gap-2">
          <label htmlFor="chat-message" className="sr-only">
            {t('chat.messageLabel')}
          </label>
          <textarea
            id="chat-message"
            rows={1}
            maxLength={2000}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault()
                void submit()
              }
            }}
            placeholder={t('chat.placeholder')}
            className="max-h-32 min-h-12 min-w-0 flex-1 resize-none rounded-2xl border border-input bg-secondary px-4 py-3 text-base outline-none placeholder:text-muted-foreground focus:border-primary"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            aria-label={t('chat.send')}
            className="primary-action flex size-12 shrink-0 items-center justify-center rounded-2xl text-primary-foreground disabled:opacity-50"
          >
            <Send className="size-5" />
          </button>
        </div>
      </form>

      {showSettings && (
        <ChatSettings
          currentProfile={profiles.find(({ id }) => id === currentUserId) ?? null}
          push={push}
          onClose={() => setShowSettings(false)}
          onUpdateDisplayName={onUpdateDisplayName}
        />
      )}
    </div>
  )
}

function ChatSettings({
  currentProfile,
  push,
  onClose,
  onUpdateDisplayName,
}: {
  currentProfile: ChatParticipant | null
  push: PushNotificationState
  onClose: () => void
  onUpdateDisplayName: (displayName: string) => Promise<boolean>
}) {
  const { t } = useI18n()
  const [name, setName] = useState(
    currentProfile ? getProfileDisplayName(currentProfile) : '',
  )
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  async function saveName() {
    if (!name.trim() || isSaving) return
    setIsSaving(true)
    const saved = await onUpdateDisplayName(name)
    setIsSaving(false)
    if (saved) onClose()
  }

  const pushMessage =
    push.support === 'unsupported'
      ? t('chat.pushUnsupported')
      : push.permission === 'denied'
        ? t('chat.pushDenied')
        : push.isEnabled
          ? t('chat.pushEnabled')
          : t('chat.pushDisabled')

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-settings-title"
        className="surface-glass w-full max-w-md rounded-3xl border border-border bg-card/95 p-5 backdrop-blur-xl"
      >
        <div className="flex items-center justify-between">
          <h2 id="chat-settings-title" className="text-xl font-semibold">
            {t('chat.settings')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.cancel')}
            className="flex size-9 items-center justify-center rounded-full bg-secondary"
          >
            <X className="size-4" />
          </button>
        </div>

        <label htmlFor="chat-display-name" className="mb-2 mt-5 block text-sm font-semibold">
          {t('chat.displayName')}
        </label>
        <input
          id="chat-display-name"
          value={name}
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
          className="w-full rounded-2xl border border-input bg-secondary px-4 py-3 outline-none focus:border-primary"
        />

        <div className="mt-5 rounded-2xl border border-border bg-secondary/60 p-4">
          <div className="flex items-start gap-3">
            {push.isEnabled ? (
              <Bell className="mt-0.5 size-5 text-success" />
            ) : (
              <BellOff className="mt-0.5 size-5 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{t('chat.notifications')}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {pushMessage}
              </p>
              {push.error && <p className="mt-1 text-xs text-destructive">{push.error}</p>}
            </div>
          </div>
          {push.support === 'available' && push.permission !== 'denied' && (
            <button
              type="button"
              disabled={push.isBusy}
              onClick={() => void (push.isEnabled ? push.disable() : push.enable())}
              className="mt-3 w-full rounded-xl border border-border bg-card py-2 text-sm font-semibold disabled:opacity-50"
            >
              {push.isEnabled ? t('chat.pushDisable') : t('chat.pushEnable')}
            </button>
          )}
        </div>

        <button
          type="button"
          disabled={
            !name.trim() ||
            name.trim() ===
              (currentProfile ? getProfileDisplayName(currentProfile) : '') ||
            isSaving
          }
          onClick={() => void saveName()}
          className="primary-action mt-5 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          <Check className="size-4" />
          {isSaving ? t('chat.saving') : t('chat.saveSettings')}
        </button>
      </section>
    </div>
  )
}
