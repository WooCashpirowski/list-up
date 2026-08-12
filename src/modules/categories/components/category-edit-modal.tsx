'use client'

import { Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useI18n } from '@/src/modules/i18n'

import type { Category } from '../types/category.types'

type CategoryEditModalProps = {
  category: Category
  onClose: () => void
  onSave: (id: string, name: string, keywords: string[]) => Promise<boolean>
}

function normalizeKeywords(keywords: string[]): string[] {
  return Array.from(
    new Set(
      keywords
        .map((keyword) => keyword.trim().toLocaleLowerCase('pl'))
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right, 'pl'))
}

function haveSameKeywords(left: string[], right: string[]): boolean {
  const normalizedLeft = normalizeKeywords(left)
  const normalizedRight = normalizeKeywords(right)

  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((keyword, index) => keyword === normalizedRight[index])
  )
}

export function CategoryEditModal({
  category,
  onClose,
  onSave,
}: CategoryEditModalProps) {
  const { t } = useI18n()
  const [name, setName] = useState(category.name)
  const [keywords, setKeywords] = useState(category.keywords)
  const [newKeyword, setNewKeyword] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const hasChanges =
    name.trim() !== category.name.trim() ||
    !haveSameKeywords(keywords, category.keywords)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const previousPaddingRight = document.body.style.paddingRight
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth

    document.body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`
    }

    return () => {
      document.body.style.overflow = previousOverflow
      document.body.style.paddingRight = previousPaddingRight
    }
  }, [])

  function addKeyword() {
    const trimmedKeyword = newKeyword.trim()
    if (!trimmedKeyword) return

    const normalizedKeyword = trimmedKeyword.toLocaleLowerCase('pl')
    const alreadyExists = keywords.some(
      (keyword) => keyword.trim().toLocaleLowerCase('pl') === normalizedKeyword,
    )

    if (!alreadyExists) {
      setKeywords((current) => [...current, trimmedKeyword])
    }
    setNewKeyword('')
  }

  function removeKeyword(keywordToRemove: string) {
    const normalizedKeyword = keywordToRemove.trim().toLocaleLowerCase('pl')

    setKeywords((current) =>
      current.filter(
        (keyword) => keyword.trim().toLocaleLowerCase('pl') !== normalizedKeyword,
      ),
    )
  }

  async function save() {
    if (!name.trim() || !hasChanges || isSaving) return
    setIsSaving(true)

    const saved = await onSave(category.id, name, keywords)
    setIsSaving(false)
    if (saved) onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-4 sm:items-center"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-edit-title"
        className="surface-glass flex max-h-[85dvh] w-full max-w-md flex-col rounded-3xl border border-border bg-card/95 p-5 backdrop-blur-xl"
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="category-edit-title" className="text-xl font-semibold">
              {t('categories.editTitle')}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('categories.editDescription')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.cancel')}
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-5 overflow-y-auto pr-1">
          <label htmlFor="edited-category-name" className="mb-2 block text-sm font-semibold">
            {t('categories.name')}
          </label>
          <input
            id="edited-category-name"
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded-2xl border border-input bg-secondary px-4 py-3 text-base outline-none focus:border-primary"
          />

          <label htmlFor="new-category-item" className="mb-2 mt-5 block text-sm font-semibold">
            {t('categories.addItem')}
          </label>
          <div className="flex gap-2">
            <input
              id="new-category-item"
              value={newKeyword}
              onChange={(event) => setNewKeyword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  addKeyword()
                }
              }}
              placeholder={t('categories.itemPlaceholder')}
              className="min-w-0 flex-1 rounded-2xl border border-input bg-secondary px-4 py-3 text-base outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={addKeyword}
              disabled={!newKeyword.trim()}
              aria-label={t('categories.addItem')}
              className="primary-action flex size-12 shrink-0 items-center justify-center rounded-2xl text-primary-foreground disabled:opacity-50"
            >
              <Plus className="size-5" />
            </button>
          </div>

          <p className="mb-2 mt-5 text-sm font-semibold">
            {t('categories.items')}
          </p>
          {keywords.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {keywords.map((keyword) => (
                <span
                  key={keyword.toLocaleLowerCase('pl')}
                  className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-secondary/80 py-1 pl-3 pr-1 text-xs font-medium"
                >
                  {keyword}
                  <button
                    type="button"
                    onClick={() => removeKeyword(keyword)}
                    aria-label={t('categories.removeItem', { name: keyword })}
                    className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="size-3" strokeWidth={2.5} />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t('categories.noItems')}
            </p>
          )}
        </div>

        <div className="mt-5 flex gap-2 border-t border-border/70 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl border border-border py-3 text-sm font-semibold"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!name.trim() || !hasChanges || isSaving}
            className="primary-action flex-1 rounded-2xl py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {isSaving ? t('categories.saving') : t('categories.saveChanges')}
          </button>
        </div>
      </div>
    </div>
  )
}
