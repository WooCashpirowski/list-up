"use client"

import { useMemo, useState } from "react"
import { ChevronLeft, Plus, GripVertical, Trash2, Check, Eraser } from "lucide-react"
import { useStore, type Item } from "./store"

export function ListView({ listId, onBack }: { listId: string; onBack: () => void }) {
  const { lists, categories, addItem, toggleItem, deleteItem, clearList } = useStore()
  const list = lists.find((l) => l.id === listId)

  const [name, setName] = useState("")
  const [qty, setQty] = useState("")
  const [category, setCategory] = useState(categories[0]?.id ?? "produce")

  const grouped = useMemo(() => {
    if (!list) return []
    const map = new Map<string, Item[]>()
    for (const it of list.items) {
      if (!map.has(it.category)) map.set(it.category, [])
      map.get(it.category)!.push(it)
    }
    return categories
      .filter((c) => map.has(c.id))
      .map((c) => ({ category: c, items: map.get(c.id)! }))
  }, [list, categories])

  if (!list) return null

  function submit() {
    if (!name.trim()) return
    addItem(list.id, name, qty, category)
    setName("")
    setQty("")
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col pb-28">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/85 backdrop-blur-xl">
        <div className="flex items-center gap-2 px-3 pb-3 pt-12">
          <button
            onClick={onBack}
            aria-label="Back to lists"
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-primary active:scale-90"
          >
            <ChevronLeft className="size-6" strokeWidth={2.5} />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-xl font-semibold tracking-tight text-foreground">
            {list.title}
          </h1>
        </div>

        {/* inline add form */}
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 rounded-2xl border border-input bg-card p-1.5 shadow-sm">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) submit()
              }}
              placeholder="Add an item…"
              className="min-w-0 flex-1 bg-transparent px-3 py-2 text-base text-foreground outline-none placeholder:text-muted-foreground"
            />
            <input
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) submit()
              }}
              placeholder="Qty"
              inputMode="text"
              className="w-14 shrink-0 rounded-xl bg-secondary px-2 py-2 text-center text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            <button
              onClick={submit}
              aria-label="Add item"
              className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground active:scale-90"
            >
              <Plus className="size-5" strokeWidth={2.5} />
            </button>
          </div>
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  category === c.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                <span aria-hidden>{c.emoji}</span> {c.name}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-6 px-4 pt-5">
        {grouped.length === 0 && (
          <div className="mt-16 flex flex-col items-center text-center">
            <span className="flex size-16 items-center justify-center rounded-3xl bg-secondary text-3xl">
              🧺
            </span>
            <p className="mt-4 text-base font-semibold text-foreground">This list is empty</p>
            <p className="mt-1 text-sm text-muted-foreground">Add your first item above.</p>
          </div>
        )}

        {grouped.map(({ category: c, items }) => (
          <section key={c.id}>
            <div className="mb-2 flex items-center gap-2 px-1">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                <span aria-hidden className="mr-1">
                  {c.emoji}
                </span>
                {c.name}
              </h2>
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-secondary px-1.5 text-xs font-semibold text-muted-foreground">
                {items.length}
              </span>
            </div>
            <ul className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
              {items.map((it, idx) => (
                <li
                  key={it.id}
                  className={`flex items-center gap-1 pr-2 ${
                    idx !== 0 ? "border-t border-border/70" : ""
                  }`}
                >
                  <span className="flex size-8 cursor-grab items-center justify-center text-muted-foreground/40">
                    <GripVertical className="size-4" />
                  </span>
                  <button
                    onClick={() => toggleItem(list.id, it.id)}
                    className="flex flex-1 items-center gap-3 py-3.5 text-left"
                  >
                    <span
                      className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                        it.done
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border"
                      }`}
                    >
                      {it.done && <Check className="size-3.5" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate text-base ${
                          it.done
                            ? "text-muted-foreground line-through"
                            : "font-medium text-foreground"
                        }`}
                      >
                        {it.name}
                      </span>
                    </span>
                    {it.quantity && (
                      <span className="shrink-0 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                        {it.quantity}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => deleteItem(list.id, it.id)}
                    aria-label={`Delete ${it.name}`}
                    className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 active:scale-90 active:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {list.items.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t border-border/70 bg-background/85 px-4 pb-6 pt-3 backdrop-blur-xl">
          <button
            onClick={() => clearList(list.id)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-secondary py-3.5 text-sm font-semibold text-foreground active:scale-[0.98]"
          >
            <Eraser className="size-4" /> Clear List
          </button>
        </div>
      )}
    </div>
  )
}
