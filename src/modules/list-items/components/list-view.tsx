'use client'

import { Dialog } from '@base-ui/react/dialog'
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
  Trash2,
  X,
} from 'lucide-react'
import { memo, useEffect, useMemo, useRef, useState } from 'react'

import { ThemeToggle } from '@/components/theme-toggle'
import { SwipeActions } from '@/components/ui/swipe-actions'
import { cn } from '@/lib/utils'
import { findCategoryForItem, getCategoryEmoji } from '@/src/modules/categories'
import { LanguageToggle, useI18n } from '@/src/modules/i18n'

import type { PendingItem } from '../hooks/use-item-composer'
import { useListViewModel } from '../hooks/use-list-view-model'
import { useStickyHeader } from '../hooks/use-sticky-header'
import type { CategoryGroup } from '../model/list-view.model'
import type { ListItem } from '../types/list-item.types'
import type {
  ListViewCategory,
  ListViewList,
} from '../types/list-view.types'
import { ItemAutocomplete } from './item-autocomplete'

type ListViewProps = {
  list: ListViewList
  categories: ListViewCategory[]
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
  onCreateCategoryAndAssignPendingItem: (name: string) => Promise<boolean>
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
      <SwipeActions
        onComplete={() => (item.is_done ? undefined : onToggle(item.id))}
        onDelete={() => onDelete(item.id)}
      >
        <div className="flex items-center gap-1 pr-2">
          <button
            onClick={() => void onToggle(item.id)}
            aria-label={t('list.toggleItem', { name: item.name })}
            aria-pressed={item.is_done}
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
      </SwipeActions>
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
              {group.isUncategorized ? '📦' : getCategoryEmoji(group.name)}
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
  onCreateCategoryAndAssignPendingItem,
  onToggleItem,
  onDeleteItem,
  onClearItems,
}: ListViewProps) {
  const { t } = useI18n()
  const [name, setName] = useState(pendingItem?.name ?? '')
  const [quantity, setQuantity] = useState(pendingItem?.quantity ?? '')
  const [selectedCategory, setSelectedCategory] = useState<string | null>('auto')
  const [isCategoryPickerOpen, setIsCategoryPickerOpen] = useState(false)
  const [isCreatingCategory, setIsCreatingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [categoryCreationFailed, setCategoryCreationFailed] = useState(false)
  const [categoryOrder, setCategoryOrder] = useState<string[]>([])
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const quantityInputRef = useRef<HTMLInputElement>(null)
  const createCategoryButtonRef = useRef<HTMLButtonElement>(null)
  const pendingSubmissionRef = useRef(false)
  const sensors = useSensors(useSensor(PointerSensor), useSensor(TouchSensor))
  const isTodo = list.list_type === 'todo'
  const { sentinelRef, isElevated } = useStickyHeader()
  const activeCategory = useMemo(
    () => selectedCategory === 'auto'
      ? findCategoryForItem(name, categories)
      : categories.find(({ id }) => id === selectedCategory) ?? null,
    [categories, name, selectedCategory],
  )
  const categoryLabel = activeCategory?.name ?? t('list.other')
  const { completedCount, effectiveCategoryOrder, groups, todoItems } =
    useListViewModel(categories, items, categoryOrder, t('list.other'))

  useEffect(() => {
    if (!isCreatingCategory) createCategoryButtonRef.current?.focus()
  }, [isCreatingCategory])

  async function submit() {
    if (!name.trim() || isSubmitting) return
    setIsSubmitting(true)
    const created = await onSubmitItem(
      name,
      isTodo ? '' : quantity,
      isTodo || selectedCategory === null ? null : activeCategory?.id ?? 'auto',
    )
    if (created) {
      setName('')
      setQuantity('')
      setSelectedCategory('auto')
      nameInputRef.current?.focus()
    }
    setIsSubmitting(false)
  }

  async function finishPending(action: () => Promise<boolean>) {
    if (isSubmitting || pendingSubmissionRef.current) return false
    pendingSubmissionRef.current = true
    setIsSubmitting(true)
    try {
      const created = await action()
      if (created) {
        setName('')
        setQuantity('')
        setSelectedCategory('auto')
        setIsCreatingCategory(false)
        setNewCategoryName('')
        setCategoryCreationFailed(false)
      }
      return created
    } finally {
      pendingSubmissionRef.current = false
      setIsSubmitting(false)
    }
  }

  async function createCategoryAndAddItem() {
    if (!newCategoryName.trim() || isSubmitting || pendingSubmissionRef.current) return
    setCategoryCreationFailed(false)
    try {
      const created = await finishPending(
        () => onCreateCategoryAndAssignPendingItem(newCategoryName),
      )
      if (!created) setCategoryCreationFailed(true)
    } catch {
      setCategoryCreationFailed(true)
    }
  }

  function changeName(value: string) {
    setName(value)
    setSelectedCategory('auto')
  }

  function chooseCategory(categoryId: string | null) {
    if (pendingItem) {
      void finishPending(categoryId === null
        ? onKeepPendingItemUncategorized
        : () => onAssignPendingItem(categoryId))
    } else {
      setSelectedCategory(categoryId)
      setIsCategoryPickerOpen(false)
    }
  }

  function closeCategoryPicker() {
    if (isSubmitting) return
    setIsCategoryPickerOpen(false)
    setIsCreatingCategory(false)
    setNewCategoryName('')
    setCategoryCreationFailed(false)
    if (pendingItem) onCancelPendingItem()
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
      <div ref={sentinelRef} aria-hidden className="pointer-events-none -mb-px h-px shrink-0" />
      <header
        data-list-type={list.list_type}
        data-elevated={isElevated}
        className="list-header sticky top-0 z-20 transition-shadow duration-200 motion-reduce:transition-none"
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

        <div className="relative px-4 pb-3">
          <div className="surface-card flex items-center gap-2 rounded-2xl border border-input bg-card/92 p-1.5 focus-within:border-primary/40">
            {isTodo ? (
              <input
                ref={nameInputRef}
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void submit()
                  }
                }}
                aria-label={t('list.todoItemName')}
                placeholder={t('list.addTodoPlaceholder')}
                className="min-w-0 flex-1 bg-transparent px-3 py-2 text-base outline-none placeholder:text-muted-foreground"
              />
            ) : (
              <ItemAutocomplete
                categories={categories}
                inputRef={nameInputRef}
                value={name}
                onChange={changeName}
                onSelect={(suggestion) =>
                  setSelectedCategory(suggestion.categoryId)
                }
                onAdvance={() => quantityInputRef.current?.focus()}
              />
            )}
            {!isTodo && (
              <input
                ref={quantityInputRef}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void submit()
                  }
                }}
                placeholder={t('list.quantityPlaceholder')}
                className="w-14 shrink-0 rounded-xl bg-secondary px-2 py-2 text-center text-sm outline-none placeholder:text-muted-foreground"
              />
            )}
            <button
              onClick={() => void submit()}
              disabled={isSubmitting || !name.trim()}
              aria-label={isTodo ? t('list.addTodoItem') : t('list.addItem')}
              className="primary-action flex size-10 shrink-0 items-center justify-center rounded-xl text-primary-foreground disabled:opacity-50"
            >
              <Plus className="size-5" strokeWidth={2.5} />
            </button>
          </div>
          {!isTodo && name.trim() && (activeCategory || selectedCategory === null) && (
            <button
              onClick={() => setIsCategoryPickerOpen(true)}
              disabled={isSubmitting}
              aria-label={t('list.changeCategoryLabel', { name: categoryLabel })}
              aria-haspopup="dialog"
              className="mt-1.5 flex min-h-9 max-w-full items-center gap-1.5 rounded-xl px-2 text-xs text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
            >
              <span aria-hidden>{activeCategory ? getCategoryEmoji(activeCategory.name) : '📦'}</span>
              <span className="truncate">{categoryLabel}</span>
              <span aria-hidden>·</span>
              <span className="shrink-0 font-medium text-primary">{t('list.changeCategory')}</span>
            </button>
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
        <div className="list-actions-bar fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-md gap-2 bg-background/82 px-4 pb-6 pt-3 backdrop-blur-xl">
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

      {!isTodo && (
        <Dialog.Root
          open={Boolean(pendingItem) || isCategoryPickerOpen}
          onOpenChange={(open) => { if (!open) closeCategoryPicker() }}
        >
          <Dialog.Portal>
            <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/35" />
            <Dialog.Popup
              finalFocus={nameInputRef}
              className="surface-glass fixed bottom-4 left-1/2 z-50 flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 flex-col rounded-3xl border border-border bg-card/95 p-5 backdrop-blur-xl sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2"
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <Dialog.Title className="text-xl font-semibold">
                    {t(isCreatingCategory ? 'list.createCategory' : 'list.chooseCategory')}
                  </Dialog.Title>
                  <Dialog.Description className="mt-1 break-words text-sm text-muted-foreground">
                    {isCreatingCategory && pendingItem
                      ? t('list.createCategoryDescription', { name: pendingItem.name })
                      : pendingItem
                        ? t('list.categoryUnknown', { name: pendingItem.name })
                        : t('list.categoryForItem', { name: name.trim() })}
                  </Dialog.Description>
                </div>
                <Dialog.Close
                  disabled={isSubmitting}
                  aria-label={t(pendingItem ? 'list.cancelAdding' : 'common.cancel')}
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary"
                >
                  <X className="size-4" />
                </Dialog.Close>
              </div>

              {isCreatingCategory && pendingItem ? (
                <form
                  className="mt-5 overflow-y-auto"
                  aria-busy={isSubmitting}
                  onSubmit={(event) => {
                    event.preventDefault()
                    void createCategoryAndAddItem()
                  }}
                >
                  <label htmlFor="pending-category-name" className="mb-2 block text-sm font-semibold">
                    {t('categories.name')}
                  </label>
                  <input
                    id="pending-category-name"
                    autoFocus
                    required
                    maxLength={120}
                    value={newCategoryName}
                    disabled={isSubmitting}
                    onChange={(event) => {
                      setNewCategoryName(event.target.value)
                      setCategoryCreationFailed(false)
                    }}
                    className="w-full rounded-2xl border border-input bg-secondary px-4 py-3 text-base outline-none focus:border-primary disabled:opacity-50"
                  />
                  {categoryCreationFailed && (
                    <p role="alert" className="mt-3 text-sm text-destructive">
                      {t('list.createCategoryError')}
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => setIsCreatingCategory(false)}
                      className="flex items-center justify-center gap-1 rounded-2xl border border-border px-4 py-3 text-sm font-semibold disabled:opacity-50"
                    >
                      <ChevronLeft aria-hidden className="size-4" />
                      {t('list.backToCategories')}
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || !newCategoryName.trim()}
                      className="primary-action flex-1 rounded-2xl px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                    >
                      {t(isSubmitting ? 'categories.saving' : 'list.createCategoryAndAdd')}
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="mt-4 grid max-h-64 grid-cols-2 gap-2 overflow-y-auto">
                    {categories.map((category) => (
                      <button
                        key={category.id}
                        onClick={() => chooseCategory(category.id)}
                        disabled={isSubmitting}
                        aria-pressed={!pendingItem && activeCategory?.id === category.id}
                        className="flex items-center gap-2 rounded-2xl border border-transparent bg-secondary px-3 py-3 text-left text-sm font-medium transition-colors hover:border-primary/25 hover:bg-accent aria-pressed:border-primary/30 aria-pressed:bg-accent disabled:opacity-50"
                      >
                        <span aria-hidden>{getCategoryEmoji(category.name)}</span>
                        <span className="truncate">{category.name}</span>
                        {!pendingItem && activeCategory?.id === category.id && (
                          <Check aria-hidden className="ml-auto size-4 shrink-0 text-primary" />
                        )}
                      </button>
                    ))}
                  </div>
                  <div className={cn('mt-3 grid gap-2', pendingItem && 'grid-cols-2')}>
                    <button
                      onClick={() => chooseCategory(null)}
                      disabled={isSubmitting}
                      aria-pressed={!pendingItem && selectedCategory === null}
                      className="min-w-0 rounded-2xl border border-border px-3 py-3 text-sm font-semibold aria-pressed:border-primary/30 aria-pressed:bg-accent disabled:opacity-50"
                    >
                      {t(pendingItem ? 'list.saveOther' : 'list.useOther')}
                    </button>
                    {pendingItem && (
                      <button
                        ref={createCategoryButtonRef}
                        onClick={() => setIsCreatingCategory(true)}
                        disabled={isSubmitting}
                        className="primary-action min-w-0 rounded-2xl px-3 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                      >
                        {t('list.createCategory')}
                      </button>
                    )}
                  </div>
                </>
              )}
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </div>
  )
}
