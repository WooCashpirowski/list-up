'use client'

import { Pencil, Plus, Search, Tags, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'

import { cn } from '@/lib/utils'
import { useI18n } from '@/src/modules/i18n'
import type { ListItem } from '@/src/modules/list-items/types/list-item.types'

import type { Category } from '../types/category.types'
import { CategoryEditModal } from './category-edit-modal'

type CategoriesViewProps = {
  categories: Category[]
  items: ListItem[]
  onCreateCategory: (name: string) => Promise<string | null>
  onSaveCategory: (
    id: string,
    name: string,
    keywords: string[],
  ) => Promise<boolean>
  onDeleteCategory: (id: string) => Promise<void>
}

const categoryEmoji: Record<string, string> = {
  alkohol: '🍷',
  elektronika: '🔌',
  higiena: '🧴',
  makarony: '🍝',
  mięso: '🥩',
  mrożonki: '❄️',
  nabiał: '🥛',
  napoje: '🥤',
  obuwie: '👟',
  odzież: '👕',
  owoce: '🍎',
  pieczywo: '🥖',
  przekąski: '🍫',
  przyprawy: '🧂',
  ryby: '🐟',
  warzywa: '🥦',
  zioła: '🌿',
  zwierzęta: '🐾',
}

const categoryToneClassNames = {
  produce: 'bg-shopping-soft text-shopping',
  pantry: 'bg-warning-soft text-warning',
  chilled: 'bg-info-soft text-info',
  protein: 'bg-destructive-soft text-destructive',
  home: 'bg-todo-soft text-todo',
  neutral: 'bg-accent text-accent-foreground',
} as const

function getCategoryTone(name: string): keyof typeof categoryToneClassNames {
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pl')

  if (/owoce|warzywa|ziola/.test(normalized)) return 'produce'
  if (/pieczywo|makarony|zbozowe|przekaski|przyprawy|konserwy|alkohol/.test(normalized)) {
    return 'pantry'
  }
  if (/nabial|mrozonki|napoje/.test(normalized)) return 'chilled'
  if (/mieso|wedliny|ryby/.test(normalized)) return 'protein'
  if (/higiena|gosp|elektronika|odziez|obuwie|zwierzeta/.test(normalized)) {
    return 'home'
  }

  return 'neutral'
}

export function getCategoryEmoji(name: string): string {
  const normalized = name.toLocaleLowerCase('pl')
  const match = Object.entries(categoryEmoji).find(([keyword]) =>
    normalized.includes(keyword),
  )
  return match?.[1] ?? '🏷️'
}

export function CategoriesView({
  categories,
  items,
  onCreateCategory,
  onSaveCategory,
  onDeleteCategory,
}: CategoriesViewProps) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')

  const itemsByCategory = useMemo(() => {
    const map = new Map<string, Map<string, string>>()

    for (const category of categories) {
      const names = new Map<string, string>()
      for (const keyword of category.keywords) {
        const trimmedKeyword = keyword.trim()
        if (!trimmedKeyword) continue
        names.set(trimmedKeyword.toLocaleLowerCase('pl'), trimmedKeyword)
      }
      map.set(category.id, names)
    }

    for (const item of items) {
      if (!item.category_id) continue
      const names = map.get(item.category_id) ?? new Map<string, string>()
      const trimmedName = item.name.trim()
      if (!trimmedName) continue
      names.set(trimmedName.toLocaleLowerCase('pl'), trimmedName)
      map.set(item.category_id, names)
    }

    return map
  }, [categories, items])

  const normalizedQuery = query.trim().toLocaleLowerCase('pl')
  const filtered = useMemo(
    () =>
      categories.filter((category) => {
        if (!normalizedQuery) return true
        const itemNames = Array.from(
          itemsByCategory.get(category.id)?.values() ?? [],
        )
        return [category.name, ...itemNames].some((value) =>
          value.toLocaleLowerCase('pl').includes(normalizedQuery),
        )
      }),
    [categories, itemsByCategory, normalizedQuery],
  )

  async function submitCreate() {
    const id = await onCreateCategory(newName)
    if (!id) return
    setNewName('')
    setAdding(false)
  }

  const editingCategory =
    categories.find((category) => category.id === editingId) ?? null

  return (
    <div className="mx-auto flex w-full max-w-md flex-col px-5 pb-28 pt-14">
      <header className="mb-5">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {t('categories.title')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('categories.description')}
        </p>
      </header>

      <div className="surface-card mb-5 flex items-center gap-2 rounded-2xl border border-input bg-card/90 px-4 py-3 backdrop-blur-sm focus-within:border-primary/45">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('categories.search')}
          className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
        />
        {query && (
          <button onClick={() => setQuery('')} aria-label={t('categories.clearSearch')}>
            <X className="size-4 text-muted-foreground" />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {adding && (
          <div className="surface-card rounded-3xl border border-primary/25 bg-card/95 p-4">
            <label htmlFor="new-category" className="mb-2 block text-sm font-semibold">
              {t('categories.name')}
            </label>
            <input
              id="new-category"
              autoFocus
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submitCreate()
                if (event.key === 'Escape') setAdding(false)
              }}
              placeholder={t('categories.name')}
              className="w-full rounded-2xl border border-input bg-secondary px-4 py-3 text-base outline-none focus:border-primary"
            />
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => {
                  setAdding(false)
                  setNewName('')
                }}
                className="flex-1 rounded-2xl border border-border py-2.5 text-sm font-semibold"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => void submitCreate()}
                className="primary-action flex-1 rounded-2xl py-2.5 text-sm font-semibold text-primary-foreground"
              >
                {t('common.add')}
              </button>
            </div>
          </div>
        )}

        {filtered.map((category) => {
          const categoryItems = Array.from(
            itemsByCategory.get(category.id)?.values() ?? [],
          )
          return (
            <article
              key={category.id}
              className="surface-card rounded-3xl border border-border bg-card/95 p-4 transition-colors hover:border-primary/20"
            >
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-2xl text-lg',
                    categoryToneClassNames[getCategoryTone(category.name)],
                  )}
                >
                  {getCategoryEmoji(category.name)}
                </span>
                <h2 className="min-w-0 flex-1 truncate text-base font-semibold">
                  {category.name}
                </h2>

                <>
                  <button
                    onClick={() => setEditingId(category.id)}
                    aria-label={t('categories.edit', { name: category.name })}
                    className="flex size-9 items-center justify-center rounded-full text-muted-foreground active:text-primary"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (
                        window.confirm(
                          t('categories.deleteConfirm', { name: category.name }),
                        )
                      ) {
                        void onDeleteCategory(category.id)
                      }
                    }}
                    aria-label={t('categories.delete', { name: category.name })}
                    className="flex size-9 items-center justify-center rounded-full text-muted-foreground active:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </>
              </div>

              {categoryItems.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {categoryItems.map((name) => (
                    <span
                      key={name}
                      className="rounded-full border border-border/70 bg-secondary/80 px-3 py-1 text-xs font-medium text-secondary-foreground"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  {t('categories.noItems')}
                </p>
              )}
            </article>
          )
        })}

        {filtered.length === 0 && !adding && (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <Tags className="mx-auto mb-3 size-7" />
            {t('categories.noMatches', { query })}
          </div>
        )}
      </div>

      <button
        onClick={() => setAdding(true)}
        aria-label={t('categories.add')}
        className="primary-action fixed bottom-24 right-5 z-30 flex size-14 items-center justify-center rounded-full text-primary-foreground transition-transform active:scale-90"
      >
        <Plus className="size-6" strokeWidth={2.5} />
      </button>

      {editingCategory && (
        <CategoryEditModal
          key={editingCategory.id}
          category={editingCategory}
          onClose={() => setEditingId(null)}
          onSave={onSaveCategory}
        />
      )}
    </div>
  )
}
