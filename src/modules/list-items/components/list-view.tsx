'use client'

import {
  closestCenter,
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Check,
  ChevronDown,
  ChevronLeft,
  Eraser,
  GripVertical,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { memo, useMemo, useState } from 'react'

import { ThemeToggle } from '@/components/theme-toggle'
import { SwipeToDelete } from '@/components/ui/swipe-to-delete'
import { cn } from '@/lib/utils'
import { getCategoryEmoji, type Category } from '@/src/modules/categories'
import { LanguageToggle, useI18n } from '@/src/modules/i18n'
import type { List } from '@/src/modules/lists'

import type { PendingItem } from '../hooks/use-item-composer'
import type { ListItem } from '../types/list-item.types'
import { ItemAutocomplete } from './item-autocomplete'

const UNCATEGORIZED_ID = '__other__'

type CategoryGroup = {
  id: string
  name: string
  emoji: string
  items: ListItem[]
}

type ListViewProps = {
  list: List
  categories: Category[]
  items: ListItem[]
  pendingItem: PendingItem | null
  onBack: () => void
  onSubmitItem: (
    name: string,
    quantity: string,
    categoryId: string | 'auto' | null,
  ) => Promise<boolean>
  onAssignPendingItem: (categoryId: string) => Promise<boolean>
  onKeepPendingItemUncategorized: () => Promise<boolean>
  onCancelPendingItem: () => void
  onToggleItem: (id: string) => Promise<void>
  onDeleteItem: (id: string) => Promise<void>
  onClearItems: (listId: string, onlyDone?: boolean) => Promise<void>
}

const ItemRow = memo(function ItemRow({
  item,
  index,
  onToggle,
  onDelete,
}: {
  item: ListItem
  index: number
  onToggle: (id: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const { t } = useI18n()

  return (
    <li
      className={index !== 0 ? 'border-t border-border/70' : undefined}
    >
      <SwipeToDelete onDelete={() => onDelete(item.id)}>
        <div className="flex items-center gap-1 pr-2">
          <button
            onClick={() => void onToggle(item.id)}
            aria-label={t('list.toggleItem', { name: item.name })}
            className="flex flex-1 items-center gap-3 py-3.5 pl-3 text-left"
          >
            <span
              className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                item.is_done
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border'
              }`}
            >
              {item.is_done && <Check className="size-3.5" strokeWidth={3} />}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={`block truncate text-base ${
                  item.is_done
                    ? 'text-muted-foreground line-through'
                    : 'font-medium text-foreground'
                }`}
              >
                {item.name}
              </span>
            </span>
            {item.quantity && (
              <span className="shrink-0 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                {item.quantity}
              </span>
            )}
          </button>
          <button
            onClick={() => void onDelete(item.id)}
            aria-label={t('list.deleteItem', { name: item.name })}
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 active:scale-90 active:text-destructive"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </SwipeToDelete>
    </li>
  )
})

function SortableCategorySection({
  group,
  collapsed,
  onToggleCollapsed,
  onToggleItem,
  onDeleteItem,
}: {
  group: CategoryGroup
  collapsed: boolean
  onToggleCollapsed: (id: string) => void
  onToggleItem: (id: string) => Promise<void>
  onDeleteItem: (id: string) => Promise<void>
}) {
  const { t } = useI18n()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: group.id })

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? 'relative z-30 opacity-80' : undefined}
    >
      <div className="mb-2 flex items-center gap-2 px-1">
        <button
          {...attributes}
          {...listeners}
          aria-label={t('list.moveCategory', { name: group.name })}
          className="flex size-7 touch-none cursor-grab items-center justify-center text-muted-foreground/50 active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
        <button
          onClick={() => onToggleCollapsed(group.id)}
          aria-expanded={!collapsed}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <h2 className="truncate text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <span
              aria-hidden
              className="mr-1 inline-flex size-7 items-center justify-center rounded-lg bg-accent text-base"
            >
              {group.emoji}
            </span>
            {group.name}
          </h2>
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-secondary px-1.5 text-xs font-semibold text-muted-foreground">
            {group.items.length}
          </span>
          <ChevronDown
            className={`ml-auto size-4 text-muted-foreground transition-transform ${
              collapsed ? '-rotate-90' : ''
            }`}
          />
        </button>
      </div>

      {!collapsed && (
        <ul className="surface-card overflow-hidden rounded-3xl border border-border bg-card/95">
          {group.items.map((item, index) => (
            <ItemRow
              key={item.id}
              item={item}
              index={index}
              onToggle={onToggleItem}
              onDelete={onDeleteItem}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

export function ListView({
  list,
  categories,
  items,
  pendingItem,
  onBack,
  onSubmitItem,
  onAssignPendingItem,
  onKeepPendingItemUncategorized,
  onCancelPendingItem,
  onToggleItem,
  onDeleteItem,
  onClearItems,
}: ListViewProps) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | 'auto'>('auto')
  const [categoryOrder, setCategoryOrder] = useState<string[]>([])
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor), useSensor(TouchSensor))
  const isTodo = list.list_type === 'todo'

  const allCategoryIds = useMemo(
    () => [...categories.map(({ id }) => id), UNCATEGORIZED_ID],
    [categories],
  )

  const effectiveCategoryOrder = useMemo(
    () => [
      ...categoryOrder.filter((id) => allCategoryIds.includes(id)),
      ...allCategoryIds.filter((id) => !categoryOrder.includes(id)),
    ],
    [allCategoryIds, categoryOrder],
  )

  const groups = useMemo(() => {
    const byCategory = new Map<string, ListItem[]>()

    for (const item of items) {
      const key = item.category_id ?? UNCATEGORIZED_ID
      const groupItems = byCategory.get(key) ?? []
      groupItems.push(item)
      byCategory.set(key, groupItems)
    }

    const categoryById = new Map(categories.map((category) => [category.id, category]))

    return effectiveCategoryOrder
      .map((id): CategoryGroup | null => {
        const groupItems = byCategory.get(id) ?? []
        if (groupItems.length === 0) return null

        const category = categoryById.get(id)
        return {
          id,
          name: category?.name ?? t('list.other'),
          emoji: category ? getCategoryEmoji(category.name) : '📦',
          items: [...groupItems].sort((left, right) =>
            left.is_done === right.is_done ? 0 : left.is_done ? 1 : -1,
          ),
        }
      })
      .filter((group): group is CategoryGroup => group !== null)
  }, [categories, effectiveCategoryOrder, items, t])

  const todoItems = useMemo(
    () =>
      [...items].sort((left, right) =>
        left.is_done === right.is_done ? 0 : left.is_done ? 1 : -1,
      ),
    [items],
  )

  const completedCount = items.filter((item) => item.is_done).length

  async function submit() {
    if (!name.trim() || isSubmitting) return
    setIsSubmitting(true)
    const created = await onSubmitItem(
      name,
      quantity,
      isTodo ? null : selectedCategory,
    )
    if (created) {
      setName('')
      setQuantity('')
    }
    setIsSubmitting(false)
  }

  async function finishPending(action: () => Promise<boolean>) {
    const created = await action()
    if (created) {
      setName('')
      setQuantity('')
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = effectiveCategoryOrder.indexOf(String(active.id))
    const newIndex = effectiveCategoryOrder.indexOf(String(over.id))
    if (oldIndex >= 0 && newIndex >= 0) {
      setCategoryOrder(arrayMove(effectiveCategoryOrder, oldIndex, newIndex))
    }
  }

  function toggleCollapsed(id: string) {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col pb-32">
      <header
        className={cn(
          'sticky top-0 z-20 border-b bg-background/82 backdrop-blur-xl',
          list.list_type === 'todo' ? 'border-todo/18' : 'border-shopping/18',
        )}
      >
        <div className="flex items-center gap-2 px-3 pb-3 pt-12">
          <button
            onClick={onBack}
            aria-label={t('list.back')}
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-full transition-colors active:scale-90',
              list.list_type === 'todo'
                ? 'text-todo hover:bg-todo-soft'
                : 'text-shopping hover:bg-shopping-soft',
            )}
          >
            <ChevronLeft className="size-6" strokeWidth={2.5} />
          </button>
          <span
            aria-hidden
            className={cn(
              'size-2.5 shrink-0 rounded-full shadow-[0_0_18px_currentColor]',
              list.list_type === 'todo' ? 'bg-todo text-todo' : 'bg-shopping text-shopping',
            )}
          />
          <h1 className="min-w-0 flex-1 truncate text-xl font-semibold tracking-tight">
            {list.title}
          </h1>
          <LanguageToggle />
          <ThemeToggle />
        </div>

        <div className="px-4 pb-3">
          <div className="surface-card flex items-center gap-2 rounded-2xl border border-input bg-card/92 p-1.5 focus-within:border-primary/40">
            {isTodo ? (
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void submit()
                }}
                aria-label={t('list.todoItemName')}
                placeholder={t('list.addTodoPlaceholder')}
                className="min-w-0 flex-1 bg-transparent px-3 py-2 text-base outline-none placeholder:text-muted-foreground"
              />
            ) : (
              <ItemAutocomplete
                categories={categories}
                value={name}
                onChange={setName}
                onSelect={(suggestion) =>
                  setSelectedCategory(suggestion.categoryId)
                }
                onSubmit={() => void submit()}
              />
            )}
            <input
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submit()
              }}
              placeholder={t('list.quantityPlaceholder')}
              className="w-14 shrink-0 rounded-xl bg-secondary px-2 py-2 text-center text-sm outline-none placeholder:text-muted-foreground"
            />
            <button
              onClick={() => void submit()}
              disabled={isSubmitting || !name.trim()}
              aria-label={isTodo ? t('list.addTodoItem') : t('list.addItem')}
              className="primary-action flex size-10 shrink-0 items-center justify-center rounded-xl text-primary-foreground disabled:opacity-50"
            >
              <Plus className="size-5" strokeWidth={2.5} />
            </button>
          </div>
          {!isTodo && (
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
              <button
                onClick={() => setSelectedCategory('auto')}
                className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium ${
                  selectedCategory === 'auto'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-muted-foreground'
                }`}
              >
                <Sparkles className="size-3" /> {t('list.autoCategory')}
              </button>
              {categories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => setSelectedCategory(category.id)}
                  className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium ${
                    selectedCategory === category.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-muted-foreground'
                  }`}
                >
                  <span aria-hidden>{getCategoryEmoji(category.name)}</span>{' '}
                  {category.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-col gap-6 px-4 pt-5">
        {items.length === 0 && (
          <div className="mt-16 flex flex-col items-center text-center">
            <span className="flex size-16 items-center justify-center rounded-3xl bg-accent text-3xl text-accent-foreground">
              {isTodo ? <Check className="size-8" strokeWidth={2.5} /> : '🧺'}
            </span>
            <p className="mt-4 text-base font-semibold">{t('list.empty')}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {isTodo
                ? t('list.emptyTodoDescription')
                : t('list.emptyDescription')}
            </p>
          </div>
        )}

        {isTodo ? (
          todoItems.length > 0 && (
            <ul className="surface-card overflow-hidden rounded-3xl border border-border bg-card/95">
              {todoItems.map((item, index) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  index={index}
                  onToggle={onToggleItem}
                  onDelete={onDeleteItem}
                />
              ))}
            </ul>
          )
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={groups.map(({ id }) => id)}
              strategy={verticalListSortingStrategy}
            >
              {groups.map((group) => (
                <SortableCategorySection
                  key={group.id}
                  group={group}
                  collapsed={collapsed.has(group.id)}
                  onToggleCollapsed={toggleCollapsed}
                  onToggleItem={onToggleItem}
                  onDeleteItem={onDeleteItem}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      {items.length > 0 && (
        <div className="surface-glass fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-md gap-2 border-t border-border/70 bg-background/82 px-4 pb-6 pt-3 backdrop-blur-xl">
          {completedCount > 0 && (
            <button
              onClick={() => void onClearItems(list.id, true)}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-secondary py-3.5 text-sm font-semibold"
            >
              <Check className="size-4" /> {t('list.clearDone')}
            </button>
          )}
          <button
            onClick={() => {
              if (window.confirm(t('list.clearConfirm'))) {
                void onClearItems(list.id)
              }
            }}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-secondary py-3.5 text-sm font-semibold"
          >
            <Eraser className="size-4" /> {t('list.clearList')}
          </button>
        </div>
      )}

      {!isTodo && pendingItem && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-4 sm:items-center">
          <div role="dialog" aria-modal="true" aria-labelledby="category-dialog-title" className="surface-glass w-full max-w-md rounded-3xl border border-border bg-card/95 p-5 backdrop-blur-xl">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h2 id="category-dialog-title" className="text-xl font-semibold">
                  {t('list.chooseCategory')}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('list.categoryUnknown', { name: pendingItem.name })}
                </p>
              </div>
              <button onClick={onCancelPendingItem} aria-label={t('list.cancelAdding')} className="flex size-9 items-center justify-center rounded-full bg-secondary">
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-4 grid max-h-64 grid-cols-2 gap-2 overflow-y-auto">
              {categories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => void finishPending(() => onAssignPendingItem(category.id))}
                  className="flex items-center gap-2 rounded-2xl border border-transparent bg-secondary px-3 py-3 text-left text-sm font-medium transition-colors hover:border-primary/25 hover:bg-accent"
                >
                  <span aria-hidden>{getCategoryEmoji(category.name)}</span>
                  <span className="truncate">{category.name}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => void finishPending(onKeepPendingItemUncategorized)}
              className="mt-3 w-full rounded-2xl border border-border py-3 text-sm font-semibold"
            >
              {t('list.saveOther')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
