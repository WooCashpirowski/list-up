'use client'

import {
  ArrowLeft,
  Bell,
  BellOff,
  Camera,
  Check,
  CheckCheck,
  Clock3,
  LoaderCircle,
  MessageCircle,
  RefreshCw,
  Send,
  Settings,
  SmilePlus,
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
import type {
  ChatMessage,
  ChatMessageDeliveryStatus,
  ChatReaction,
} from '../types/chat.types'
import { getGiphyByIds, isGiphyConfigured, trackGiphy, type GiphyGif } from '../services/giphy.service'
import { normalizeChatPhoto } from '../services/photo-processing'
import { ChatLinks } from './chat-links'
import { ChatPhoto } from './chat-photo'
import { GifDrawer } from './gif-drawer'
import { GiphyAttribution } from './giphy-attribution'
import { ReactionPicker } from './reaction-picker'

export type ChatParticipant = {
  id: string
  email: string
  display_name: string
  alias?: string | null
}

type ChatViewProps = {
  currentUserId: string
  currentProfile: ChatParticipant | null
  peer: ChatParticipant
  messages: ChatMessage[]
  isLoading: boolean
  isLoadingOlder: boolean
  hasOlder: boolean
  error: string | null
  isPeerTyping: boolean
  push: PushNotificationState
  onSendMessage: (body: string) => Promise<boolean>
  onSendGif: (gifId: string) => Promise<boolean>
  onSendPhoto: (blob: Blob) => Promise<boolean>
  reactions: Map<string, ChatReaction>
  onToggleReaction: (messageId: string, emoji: string) => Promise<void>
  onSetPeerAlias: (alias: string | null) => Promise<boolean>
  onRetryMessage: (id: string) => Promise<void>
  onLoadOlder: () => Promise<void>
  onMarkReadThrough: (sequence: number) => Promise<void>
  onTypingChange: (isTyping: boolean) => void
  onUpdateDisplayName: (displayName: string) => Promise<boolean>
  onBack: () => void
}

type MessageBubbleProps = {
  message: ChatMessage
  own: boolean
  senderName: string
  time: string
  isLatestIncoming: boolean
  latestIncomingRef: React.RefObject<HTMLDivElement | null>
  retryLabel: string
  statusLabel: string
  onRetry: (id: string) => void
  reaction: ChatReaction | null
  onOpenReaction: (id: string) => void
  onToggleReaction: (id: string, emoji: string) => void
  gif: GiphyGif | null
  photoLabel: string
  gifLabel: string
  reactionLabel: string
}

const MessageBubble = memo(function MessageBubble({
  message,
  own,
  senderName,
  time,
  isLatestIncoming,
  latestIncomingRef,
  retryLabel,
  statusLabel,
  onRetry,
  reaction,
  onOpenReaction,
  onToggleReaction,
  gif,
  photoLabel,
  gifLabel,
  reactionLabel,
}: MessageBubbleProps) {
  const holdTimer = useRef<number | null>(null)
  const gifViewed = useRef(false)
  const pointerStart = useRef({ x: 0, y: 0 })
  const cancelHold = () => {
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current)
    holdTimer.current = null
  }
  useEffect(() => () => cancelHold(), [])
  return (
    <div
      ref={isLatestIncoming ? latestIncomingRef : undefined}
      className={cn('flex', own ? 'justify-end' : 'justify-start')}
      data-message-sequence={message.sequence ?? undefined}
    >
      <article
        onPointerDown={(event) => {
          if (own || event.pointerType === 'mouse') return
          pointerStart.current = { x: event.clientX, y: event.clientY }
          cancelHold()
          holdTimer.current = window.setTimeout(() => onOpenReaction(message.id), 450)
        }}
        onPointerMove={(event) => {
          if (Math.abs(event.clientX - pointerStart.current.x) > 10 ||
            Math.abs(event.clientY - pointerStart.current.y) > 10) cancelHold()
        }}
        onPointerUp={cancelHold}
        onPointerCancel={cancelHold}
        onPointerLeave={cancelHold}
        onContextMenu={(event) => {
          if (own) return
          event.preventDefault()
          onOpenReaction(message.id)
        }}
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
        {(message.kind ?? 'text') === 'text' &&
          <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
            <ChatLinks body={message.body} />
          </p>}
        {message.kind === 'photo' && <ChatPhoto message={message} label={photoLabel} />}
        {message.kind === 'gif' && (gif?.images.fixed_width?.url || gif?.images.original?.url
          ? <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={gif.images.fixed_width?.url ?? gif.images.original?.url}
                alt={gif.title || gifLabel} className="max-h-72 max-w-full rounded-xl"
                onLoad={() => {
                  if (gifViewed.current) return
                  gifViewed.current = true
                  trackGiphy(gif.analytics?.onload?.url)
                }} />
              <GiphyAttribution />
            </div>
          : <div className="rounded-xl bg-secondary px-6 py-8 text-sm text-muted-foreground">{gifLabel}</div>)}
        <div
          className={cn(
            'mt-1 flex items-center justify-end gap-1 text-[11px]',
            own ? 'text-primary-foreground/72' : 'text-muted-foreground',
          )}
        >
          <time dateTime={message.created_at}>{time}</time>
          {own && message.delivery_status === 'sent' && (
            <Check className="size-3.5" aria-label={statusLabel} />
          )}
          {own && message.delivery_status === 'delivered' && (
            <CheckCheck
              className="size-3.5"
              aria-label={statusLabel}
            />
          )}
          {own && message.delivery_status === 'read' && (
            <CheckCheck
              className="size-3.5 text-sky-200 dark:text-sky-300"
              aria-label={statusLabel}
            />
          )}
          {own && message.delivery_status === 'sending' && (
            <LoaderCircle
              className="size-3.5 animate-spin"
              aria-label={statusLabel}
            />
          )}
          {own && message.delivery_status === 'queued' && (
            <Clock3
              className="size-3.5"
              aria-label={statusLabel}
            />
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
          {!own && <button type="button" onClick={() => onOpenReaction(message.id)}
            aria-label={reactionLabel} className="ml-1 rounded-full p-1">
            <SmilePlus className="size-4" />
          </button>}
        </div>
        {reaction && (own
          ? <span aria-label={`${reactionLabel}: ${reaction.emoji}`}
              className="mt-1 inline-block rounded-full bg-secondary px-2 py-0.5 text-base">{reaction.emoji}</span>
          : <button type="button" aria-label={`${reactionLabel}: ${reaction.emoji}`}
              onClick={() => onToggleReaction(message.id, reaction.emoji)}
              className="mt-1 rounded-full bg-secondary px-2 py-0.5 text-base">{reaction.emoji}</button>)}
      </article>
    </div>
  )
})

const TypingIndicator = memo(function TypingIndicator({
  senderName,
  label,
}: {
  senderName: string
  label: string
}) {
  return (
    <div className="flex justify-start" role="status" aria-label={label}>
      <div className="surface-card rounded-3xl rounded-bl-lg border border-border bg-card/95 px-4 py-2.5 text-card-foreground">
        <p className="mb-1 text-xs font-semibold text-primary">{senderName}</p>
        <span className="flex h-4 items-center gap-1" aria-hidden="true">
          <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s] motion-reduce:animate-none" />
          <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s] motion-reduce:animate-none" />
          <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground motion-reduce:animate-none" />
        </span>
      </div>
    </div>
  )
})

function dateKey(value: string): string {
  const date = new Date(value)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

export function ChatView({
  currentUserId,
  currentProfile,
  peer,
  messages,
  isLoading,
  isLoadingOlder,
  hasOlder,
  error,
  isPeerTyping,
  push,
  onSendMessage,
  onSendGif,
  onSendPhoto,
  reactions,
  onToggleReaction,
  onSetPeerAlias,
  onRetryMessage,
  onLoadOlder,
  onMarkReadThrough,
  onTypingChange,
  onUpdateDisplayName,
  onBack,
}: ChatViewProps) {
  const { locale, t } = useI18n()
  const [draft, setDraft] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [showNewMessages, setShowNewMessages] = useState(false)
  const [reactionMessageId, setReactionMessageId] = useState<string | null>(null)
  const [showGifDrawer, setShowGifDrawer] = useState(false)
  const [showPhotoMenu, setShowPhotoMenu] = useState(false)
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [mediaError, setMediaError] = useState<string | null>(null)
  const [gifMetadata, setGifMetadata] = useState(new Map<string, GiphyGif>())
  const [giphyOnlineRevision, setGiphyOnlineRevision] = useState(0)
  const requestedGifs = useRef(new Set<string>())
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { void import('heic2any').catch(() => undefined) }, [])
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
  const peerName = useMemo(() => peer.alias || getProfileDisplayName(peer), [peer])

  useEffect(() => {
    const retry = () => setGiphyOnlineRevision((current) => current + 1)
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [])

  useEffect(() => {
    if (!isGiphyConfigured()) return
    const missing = [...new Set(messages.filter((message) => message.kind === 'gif')
      .map((message) => message.gif_id).filter((id): id is string => Boolean(id)))]
      .filter((id) => !gifMetadata.has(id) && !requestedGifs.current.has(id))
    if (!missing.length) return
    missing.forEach((id) => requestedGifs.current.add(id))
    for (let offset = 0; offset < missing.length; offset += 50) {
      void getGiphyByIds(missing.slice(offset, offset + 50)).then((items) => {
        setGifMetadata((current) => new Map([...current, ...items.map((item) => [item.id, item] as const)]))
      }).catch(() => {
        missing.slice(offset, offset + 50).forEach((id) => requestedGifs.current.delete(id))
      })
    }
  }, [gifMetadata, giphyOnlineRevision, messages])

  useEffect(() => () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl)
  }, [photoUrl])

  async function choosePhoto(file: File | undefined) {
    if (!file) return
    setShowPhotoMenu(false)
    setMediaError(null)
    try {
      const blob = await normalizeChatPhoto(file)
      setPhotoBlob(blob)
      setPhotoUrl(URL.createObjectURL(blob))
    }
    catch { setMediaError(t('chat.photoError')) }
  }
  const deliveryLabels = useMemo<
    Record<Exclude<ChatMessageDeliveryStatus, 'failed'>, string>
  >(
    () => ({
      sending: t('chat.statusSending'),
      queued: t('chat.statusQueued'),
      sent: t('chat.statusSent'),
      delivered: t('chat.statusDelivered'),
      read: t('chat.statusRead'),
    }),
    [t],
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

  useLayoutEffect(() => {
    const container = scrollRef.current
    if (isPeerTyping && container && nearBottomRef.current) {
      container.scrollTop = container.scrollHeight
    }
  }, [isPeerTyping])

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
    onTypingChange(false)
    const sent = await onSendMessage(body)
    if (!sent) setDraft(body)
    nearBottomRef.current = true
  }, [draft, onSendMessage, onTypingChange])

  useEffect(
    () => () => {
      onTypingChange(false)
    },
    [onTypingChange],
  )

  return (
    <div className="relative mx-auto flex h-dvh w-full max-w-md flex-col">
      <header className="surface-glass z-20 flex items-center justify-between gap-3 border-b border-border bg-card/82 px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            aria-label={t('chat.backToInbox')}
            className="surface-card flex size-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-card/90"
          >
            <ArrowLeft className="size-5" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight">{peerName}</h1>
            <p className="truncate text-xs text-muted-foreground">
              {peer.email}
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
        ) : messages.length === 0 && !isPeerTyping ? (
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
                    senderName={peerName}
                    time={timeFormatter.format(new Date(message.created_at))}
                    isLatestIncoming={message.sequence === latestIncomingSequence}
                    latestIncomingRef={latestIncomingRef}
                    retryLabel={t('chat.retry')}
                    statusLabel={
                      message.delivery_status === 'failed'
                        ? t('chat.retry')
                        : deliveryLabels[message.delivery_status]
                    }
                    onRetry={onRetryMessage}
                    reaction={reactions.get(message.id) ?? null}
                    onOpenReaction={setReactionMessageId}
                    onToggleReaction={(id, emoji) => void onToggleReaction(id, emoji)}
                    gif={message.gif_id ? gifMetadata.get(message.gif_id) ?? null : null}
                    photoLabel={t('chat.photo')}
                    gifLabel={t('chat.gif')}
                    reactionLabel={t('chat.chooseReaction')}
                  />
                </div>
              )
            })}
            {isPeerTyping && (
              <TypingIndicator
                senderName={peerName}
                label={t('chat.typing', { name: peerName })}
              />
            )}
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
        className="surface-glass relative z-20 border-t border-border bg-card/88 px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl"
      >
        {(error || mediaError) && <p className="mb-2 text-xs text-destructive">{error || mediaError}</p>}
        <div className="flex items-end gap-2">
          <button type="button" onClick={() => setShowGifDrawer(true)}
            aria-label={t('chat.gifs')}
            className="surface-card flex size-11 shrink-0 items-center justify-center rounded-xl border border-border text-xs font-bold">
            GIF
          </button>
          <label htmlFor="chat-message" className="sr-only">
            {t('chat.messageLabel')}
          </label>
          <textarea
            id="chat-message"
            rows={1}
            maxLength={2000}
            value={draft}
            onChange={(event) => {
              const value = event.target.value
              setDraft(value)
              onTypingChange(value.length > 0)
            }}
            onBlur={() => onTypingChange(false)}
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
          <button type="button" onClick={() => setShowPhotoMenu((current) => !current)}
            aria-label={t('chat.addPhoto')}
            className="surface-card flex size-11 shrink-0 items-center justify-center rounded-xl border border-border">
            <Camera className="size-5" />
          </button>
          <button
            type="submit"
            disabled={!draft.trim()}
            aria-label={t('chat.send')}
            className="primary-action flex size-12 shrink-0 items-center justify-center rounded-2xl text-primary-foreground disabled:opacity-50"
          >
            <Send className="size-5" />
          </button>
        </div>
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment"
          className="hidden" onChange={(event) => {
            void choosePhoto(event.target.files?.[0]); event.target.value = ''
          }} />
        <input ref={galleryInputRef} type="file" accept="image/*,.heic,.heif"
          className="hidden" onChange={(event) => {
            void choosePhoto(event.target.files?.[0]); event.target.value = ''
          }} />
        {showPhotoMenu && <div className="absolute bottom-36 right-4 z-30 flex flex-col rounded-2xl border border-border bg-card p-2 shadow-lg">
          <button type="button" className="px-4 py-2 text-left" onClick={() => cameraInputRef.current?.click()}>{t('chat.camera')}</button>
          <button type="button" className="px-4 py-2 text-left" onClick={() => galleryInputRef.current?.click()}>{t('chat.gallery')}</button>
        </div>}
      </form>

      {showSettings && (
        <ChatSettings
          currentProfile={currentProfile}
          push={push}
          onClose={() => setShowSettings(false)}
          onUpdateDisplayName={onUpdateDisplayName}
          peer={peer}
          onSetPeerAlias={onSetPeerAlias}
        />
      )}
      {reactionMessageId && <ReactionPicker
        active={reactions.get(reactionMessageId)?.emoji ?? null}
        onClose={() => setReactionMessageId(null)}
        onSelect={(emoji) => {
          void onToggleReaction(reactionMessageId, emoji)
          setReactionMessageId(null)
        }} />}
      {showGifDrawer && <GifDrawer onClose={() => setShowGifDrawer(false)}
        onSend={async (gif) => {
          setGifMetadata((current) => new Map(current).set(gif.id, gif))
          return onSendGif(gif.id)
        }} />}
      {photoBlob && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4">
        <section role="dialog" aria-modal="true" aria-label={t('chat.photoPreview')}
          className="w-full max-w-md rounded-3xl bg-card p-4">
          <h2 className="mb-3 font-semibold">{t('chat.photoPreview')}</h2>
          {photoUrl && <>{/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl} alt={t('chat.photoPreview')} className="max-h-[55dvh] w-full rounded-2xl object-contain" /></>}
          <div className="mt-4 flex gap-2">
            <button type="button" className="flex-1 rounded-xl bg-secondary p-3"
              onClick={() => { setPhotoBlob(null); setPhotoUrl(null) }}>{t('common.cancel')}</button>
            <button type="button" className="primary-action flex-1 rounded-xl p-3 text-primary-foreground"
              onClick={async () => { if (await onSendPhoto(photoBlob)) { setPhotoBlob(null); setPhotoUrl(null) } }}>
              {t('chat.sendPhoto')}
            </button>
          </div>
        </section>
      </div>}
    </div>
  )
}

export function ChatSettings({
  currentProfile,
  peer,
  push,
  onClose,
  onUpdateDisplayName,
  onSetPeerAlias,
}: {
  currentProfile: ChatParticipant | null
  peer?: ChatParticipant
  push: PushNotificationState
  onClose: () => void
  onUpdateDisplayName: (displayName: string) => Promise<boolean>
  onSetPeerAlias?: (alias: string | null) => Promise<boolean>
}) {
  const { t } = useI18n()
  const [name, setName] = useState(
    currentProfile ? getProfileDisplayName(currentProfile) : '',
  )
  const [isSaving, setIsSaving] = useState(false)
  const [alias, setAlias] = useState(peer?.alias ?? '')
  const [isSavingAlias, setIsSavingAlias] = useState(false)

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
        className="surface-glass max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-3xl border border-border bg-card/95 p-5 backdrop-blur-xl"
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

        {peer && onSetPeerAlias && <div className="mt-5 border-t border-border pt-4">
          <label htmlFor="chat-peer-alias" className="mb-2 block text-sm font-semibold">
            {t('chat.peerAlias')}
          </label>
          <p className="mb-2 text-xs text-muted-foreground">{t('chat.peerAliasHint')}</p>
          <input id="chat-peer-alias" value={alias} maxLength={60}
            onChange={(event) => setAlias(event.target.value)}
            placeholder={getProfileDisplayName(peer)}
            className="w-full rounded-2xl border border-input bg-secondary px-4 py-3 outline-none focus:border-primary" />
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={isSavingAlias || !alias.trim() || alias.trim() === (peer.alias ?? '')}
              onClick={async () => {
                setIsSavingAlias(true)
                await onSetPeerAlias(alias)
                setIsSavingAlias(false)
              }} className="primary-action flex-1 rounded-xl py-2 text-sm text-primary-foreground disabled:opacity-50">
              {t('chat.saveAlias')}
            </button>
            {peer.alias && <button type="button" disabled={isSavingAlias}
              onClick={async () => {
                setIsSavingAlias(true)
                if (await onSetPeerAlias(null)) setAlias('')
                setIsSavingAlias(false)
              }} className="rounded-xl bg-secondary px-3 py-2 text-sm disabled:opacity-50">
              {t('chat.resetAlias')}
            </button>}
          </div>
        </div>}

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
