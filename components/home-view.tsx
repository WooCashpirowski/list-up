"use client"

import { useEffect, useState } from "react"
import { Plus, ShoppingBasket, ListChecks, ChevronRight } from "lucide-react"
import { useStore, timeAgo } from "./store"
import { ThemeToggle } from "./theme-toggle"

export function HomeView({ onOpenList }: { onOpenList: (id: string) => void }) {
  const { lists, createList } = useStore()
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState("")
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  function submit() {
    if (!title.trim()) return
    const id = createList(title)
    setTitle("")
    setCreating(false)
    onOpenList(id)
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col px-5 pb-28 pt-14">
      <header className="mb-7 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Good to see you</p>
          <h1 className="text-pretty text-3xl font-semibold tracking-tight text-foreground">
            My Lists
          </h1>
        </div>
        <ThemeToggle />
      </header>

      <div className="flex flex-col gap-3">
        {lists.map((list) => {
          const remaining = list.items.filter((i) => !i.done).length
          const total = list.items.length
          return (
            <button
              key={list.id}
              onClick={() => onOpenList(list.id)}
              className="group flex items-center gap-4 rounded-3xl border border-border bg-card p-4 text-left shadow-sm transition-all active:scale-[0.98]"
            >
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
                <ShoppingBasket className="size-6" strokeWidth={2} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-semibold text-foreground">
                  {list.title}
                </span>
                <span className="mt-0.5 block text-sm text-muted-foreground">
                  {total === 0
                    ? mounted
                      ? "Empty · updated " + timeAgo(list.updatedAt)
                      : "Empty"
                    : mounted
                      ? `${remaining} left of ${total} · ${timeAgo(list.updatedAt)}`
                      : `${remaining} left of ${total}`}
                </span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground/60 transition-transform group-active:translate-x-0.5" />
            </button>
          )
        })}
      </div>

      <div className="mt-4">
        {creating ? (
          <div className="rounded-3xl border border-primary/30 bg-card p-4 shadow-sm">
            <label htmlFor="new-list" className="mb-2 block text-sm font-medium text-foreground">
              Name your list
            </label>
            <input
              id="new-list"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) submit()
                if (e.key === "Escape") {
                  setCreating(false)
                  setTitle("")
                }
              }}
              placeholder="e.g. Farmers market"
              className="w-full rounded-2xl border border-input bg-secondary px-4 py-3 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
            />
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => {
                  setCreating(false)
                  setTitle("")
                }}
                className="flex-1 rounded-2xl border border-border py-3 text-sm font-semibold text-foreground active:scale-[0.98]"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                className="flex-1 rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground active:scale-[0.98]"
              >
                Create
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="flex w-full items-center gap-4 rounded-3xl border-2 border-dashed border-border bg-transparent p-4 text-left transition-colors active:scale-[0.98]"
          >
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <Plus className="size-6" strokeWidth={2.5} />
            </span>
            <span>
              <span className="block text-base font-semibold text-foreground">Create New List</span>
              <span className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                <ListChecks className="size-3.5" /> Groceries, chores, anything
              </span>
            </span>
          </button>
        )}
      </div>
    </div>
  )
}
