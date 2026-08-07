"use client"

import { useMemo, useState } from "react"
import { Search, Plus, Pencil, Trash2, Check, X } from "lucide-react"
import { useStore } from "./store"

export function CategoriesView() {
  const { categories, lists, addCategory, renameCategory, deleteCategory } = useStore()
  const [query, setQuery] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState("")
  const [newEmoji, setNewEmoji] = useState("")

  // aggregate distinct item names per category across every list
  const itemsByCategory = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const list of lists) {
      for (const it of list.items) {
        if (!map.has(it.category)) map.set(it.category, new Set())
        map.get(it.category)!.add(it.name)
      }
    }
    return map
  }, [lists])

  const filtered = categories.filter((c) =>
    c.name.toLowerCase().includes(query.trim().toLowerCase()),
  )

  return (
    <div className="mx-auto flex w-full max-w-md flex-col px-5 pb-28 pt-14">
      <header className="mb-5">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Categories</h1>
        <p className="mt-1 text-sm text-muted-foreground">Organize items the way you shop.</p>
      </header>

      <div className="mb-5 flex items-center gap-2 rounded-2xl border border-input bg-card px-4 py-3 shadow-sm">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search categories"
          className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
        />
        {query && (
          <button onClick={() => setQuery("")} aria-label="Clear search">
            <X className="size-4 text-muted-foreground" />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {adding && (
          <div className="rounded-3xl border border-primary/30 bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <input
                value={newEmoji}
                onChange={(e) => setNewEmoji(e.target.value.slice(0, 2))}
                placeholder="🏷️"
                aria-label="Category emoji"
                className="w-14 shrink-0 rounded-2xl bg-secondary py-3 text-center text-lg outline-none"
              />
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                    if (newName.trim()) addCategory(newName, newEmoji)
                    setNewName("")
                    setNewEmoji("")
                    setAdding(false)
                  }
                }}
                placeholder="Category name"
                className="min-w-0 flex-1 rounded-2xl border border-input bg-secondary px-4 py-3 text-base text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
              />
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => {
                  setAdding(false)
                  setNewName("")
                  setNewEmoji("")
                }}
                className="flex-1 rounded-2xl border border-border py-2.5 text-sm font-semibold text-foreground active:scale-[0.98]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (newName.trim()) addCategory(newName, newEmoji)
                  setNewName("")
                  setNewEmoji("")
                  setAdding(false)
                }}
                className="flex-1 rounded-2xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground active:scale-[0.98]"
              >
                Add
              </button>
            </div>
          </div>
        )}

        {filtered.map((c) => {
          const items = Array.from(itemsByCategory.get(c.id) ?? [])
          const isEditing = editingId === c.id
          return (
            <div key={c.id} className="rounded-3xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-accent text-lg">
                  {c.emoji}
                </span>
                {isEditing ? (
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                        if (draft.trim()) renameCategory(c.id, draft.trim())
                        setEditingId(null)
                      }
                    }}
                    className="min-w-0 flex-1 rounded-xl border border-primary bg-secondary px-3 py-1.5 text-base font-semibold text-foreground outline-none"
                  />
                ) : (
                  <h2 className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">
                    {c.name}
                  </h2>
                )}

                {isEditing ? (
                  <button
                    onClick={() => {
                      if (draft.trim()) renameCategory(c.id, draft.trim())
                      setEditingId(null)
                    }}
                    aria-label="Save name"
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground active:scale-90"
                  >
                    <Check className="size-4" strokeWidth={2.5} />
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setEditingId(c.id)
                        setDraft(c.name)
                      }}
                      aria-label={`Edit ${c.name}`}
                      className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground active:scale-90"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      onClick={() => deleteCategory(c.id)}
                      aria-label={`Delete ${c.name}`}
                      className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground active:scale-90 active:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </>
                )}
              </div>

              {items.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {items.map((name) => (
                    <span
                      key={name}
                      className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">No items yet.</p>
              )}
            </div>
          )
        })}

        {filtered.length === 0 && !adding && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No categories match “{query}”.
          </p>
        )}
      </div>

      <button
        onClick={() => setAdding(true)}
        aria-label="Add category"
        className="fixed bottom-24 right-5 z-30 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 active:scale-90"
      >
        <Plus className="size-6" strokeWidth={2.5} />
      </button>
    </div>
  )
}
