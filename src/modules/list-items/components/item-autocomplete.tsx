'use client'

import { Check, Search } from 'lucide-react'
import { useId, useState } from 'react'

import { getCategoryEmoji, type Category } from '@/src/modules/categories'
import { useI18n } from '@/src/modules/i18n'

import { useItemSuggestions } from '../hooks/use-item-suggestions'
import type { ItemSuggestion } from '../types/item-suggestion.types'

type ItemAutocompleteProps = {
  categories: Category[]
  value: string
  onChange: (value: string) => void
  onSelect: (suggestion: ItemSuggestion) => void
  onSubmit: () => void
}

export function ItemAutocomplete({
  categories,
  value,
  onChange,
  onSelect,
  onSubmit,
}: ItemAutocompleteProps) {
  const { t } = useI18n()
  const listboxId = useId()
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const suggestions = useItemSuggestions(categories, value)
  const hasMinimumQuery = value.trim().length >= 2
  const isListboxVisible = isOpen && hasMinimumQuery
  const effectiveActiveIndex = Math.min(
    activeIndex,
    Math.max(suggestions.length - 1, 0),
  )
  const activeSuggestion = suggestions[effectiveActiveIndex]

  function chooseSuggestion(suggestion: ItemSuggestion) {
    onChange(suggestion.name)
    onSelect(suggestion)
    setIsOpen(false)
    setActiveIndex(0)
  }

  return (
    <div className="relative min-w-0 flex-1">
      <input
        role="combobox"
        aria-label={t('list.itemName')}
        aria-autocomplete="list"
        aria-controls={isListboxVisible ? listboxId : undefined}
        aria-expanded={isListboxVisible}
        aria-activedescendant={
          isListboxVisible && activeSuggestion
            ? `${listboxId}-${activeSuggestion.id}`
            : undefined
        }
        value={value}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        onChange={(event) => {
          onChange(event.target.value)
          setActiveIndex(0)
          setIsOpen(true)
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setIsOpen(true)
            setActiveIndex((current) =>
              suggestions.length === 0 ? 0 : (current + 1) % suggestions.length,
            )
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setIsOpen(true)
            setActiveIndex((current) =>
              suggestions.length === 0
                ? 0
                : (current - 1 + suggestions.length) % suggestions.length,
            )
          } else if (event.key === 'Escape') {
            setIsOpen(false)
          } else if (event.key === 'Enter') {
            event.preventDefault()
            if (isListboxVisible && activeSuggestion) {
              chooseSuggestion(activeSuggestion)
            } else {
              onSubmit()
            }
          }
        }}
        placeholder={t('list.addItemPlaceholder')}
        className="w-full bg-transparent px-3 py-2 text-base outline-none placeholder:text-muted-foreground"
      />

      {isListboxVisible && (
        <div className="surface-glass absolute left-0 top-[calc(100%+0.65rem)] z-50 w-[min(22rem,calc(100vw-3rem))] overflow-hidden rounded-2xl border border-border bg-popover/95 backdrop-blur-xl">
          <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Search className="size-3.5" />
            {t('list.suggestions', { count: suggestions.length })}
          </div>

          {suggestions.length > 0 ? (
            <ul id={listboxId} role="listbox" className="max-h-72 overflow-y-auto p-1.5">
              {suggestions.map((suggestion, index) => {
                const isActive = index === effectiveActiveIndex

                return (
                  <li
                    id={`${listboxId}-${suggestion.id}`}
                    key={suggestion.id}
                    role="option"
                    aria-selected={isActive}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => chooseSuggestion(suggestion)}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                      isActive ? 'bg-accent text-accent-foreground' : 'text-foreground'
                    }`}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-base">
                      {getCategoryEmoji(suggestion.categoryName)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {suggestion.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {suggestion.categoryName}
                      </span>
                    </span>
                    {isActive && <Check className="size-4 shrink-0 text-primary" />}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="px-4 py-5 text-center text-sm text-muted-foreground">
              {t('list.noSuggestions')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
