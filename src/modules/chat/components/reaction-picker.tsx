'use client'

import EmojiPicker from 'emoji-picker-react'
import { Plus, X } from 'lucide-react'
import { useState } from 'react'

import { useI18n } from '@/src/modules/i18n'

const FAVORITES = ['😀', '😂', '👍', '❤️', '😮']

export function ReactionPicker({ active, onSelect, onClose }: {
  active: string | null
  onSelect: (emoji: string) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const [showAll, setShowAll] = useState(false)
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4"
    onClick={onClose}>
    <section role="dialog" aria-modal="true" aria-label={t('chat.chooseReaction')}
      className="surface-glass w-full max-w-md rounded-3xl bg-card p-4"
      onClick={(event) => event.stopPropagation()}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{t('chat.chooseReaction')}</h2>
        <button type="button" onClick={onClose} aria-label={t('common.cancel')}><X className="size-5" /></button>
      </div>
      <div className="flex justify-between gap-1">
        {FAVORITES.map((emoji) => <button key={emoji} type="button" aria-label={emoji}
          aria-pressed={active === emoji}
          onClick={() => onSelect(emoji)}
          className="flex size-11 items-center justify-center rounded-full text-2xl aria-pressed:bg-primary/20">
          {emoji}
        </button>)}
        <button type="button" onClick={() => setShowAll((current) => !current)}
          aria-label={t('chat.moreReactions')}
          className="flex size-11 items-center justify-center rounded-full bg-secondary">
          <Plus className="size-5" />
        </button>
      </div>
      {showAll && <div className="mt-3 overflow-hidden rounded-xl">
        <EmojiPicker width="100%" height={350} lazyLoadEmojis
          onEmojiClick={(item) => onSelect(item.emoji)} />
      </div>}
    </section>
  </div>
}
