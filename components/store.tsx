"use client"

import type React from "react"
import { createContext, useCallback, useContext, useMemo, useState } from "react"

export type Item = {
  id: string
  name: string
  quantity?: string
  done: boolean
  category: string
}

export type List = {
  id: string
  title: string
  updatedAt: number
  items: Item[]
}

export type Category = {
  id: string
  name: string
  emoji: string
}

export const CATEGORIES: Category[] = [
  { id: "produce", name: "Produce", emoji: "🥬" },
  { id: "dairy", name: "Dairy & Eggs", emoji: "🥛" },
  { id: "bakery", name: "Bakery", emoji: "🥖" },
  { id: "pantry", name: "Pantry", emoji: "🫙" },
  { id: "household", name: "Household", emoji: "🧴" },
  { id: "todo", name: "To-do", emoji: "✅" },
]

let idCounter = 1000
const nextId = () => `id-${idCounter++}`

const now = Date.now()

const seedLists: List[] = [
  {
    id: "l1",
    title: "Weekly Groceries",
    updatedAt: now - 1000 * 60 * 12,
    items: [
      { id: "i1", name: "Spinach", quantity: "1 bag", done: false, category: "produce" },
      { id: "i2", name: "Bananas", quantity: "6", done: false, category: "produce" },
      { id: "i3", name: "Avocados", quantity: "3", done: true, category: "produce" },
      { id: "i4", name: "Whole milk", quantity: "1 gal", done: false, category: "dairy" },
      { id: "i5", name: "Greek yogurt", done: false, category: "dairy" },
      { id: "i6", name: "Sourdough loaf", done: true, category: "bakery" },
      { id: "i7", name: "Olive oil", done: false, category: "pantry" },
      { id: "i8", name: "Paper towels", quantity: "2", done: false, category: "household" },
    ],
  },
  {
    id: "l2",
    title: "Sunday Dinner Party",
    updatedAt: now - 1000 * 60 * 60 * 5,
    items: [
      { id: "i9", name: "Fresh basil", done: false, category: "produce" },
      { id: "i10", name: "Parmesan", done: false, category: "dairy" },
      { id: "i11", name: "Book table for 8", done: false, category: "todo" },
    ],
  },
  {
    id: "l3",
    title: "Apartment To-dos",
    updatedAt: now - 1000 * 60 * 60 * 26,
    items: [
      { id: "i12", name: "Replace air filter", done: false, category: "todo" },
      { id: "i13", name: "Dish soap", quantity: "2", done: true, category: "household" },
    ],
  },
]

type StoreValue = {
  lists: List[]
  categories: Category[]
  createList: (title: string) => string
  addItem: (listId: string, name: string, quantity: string, category: string) => void
  toggleItem: (listId: string, itemId: string) => void
  deleteItem: (listId: string, itemId: string) => void
  clearList: (listId: string) => void
  addCategory: (name: string, emoji: string) => void
  renameCategory: (id: string, name: string) => void
  deleteCategory: (id: string) => void
}

const StoreContext = createContext<StoreValue | null>(null)

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [lists, setLists] = useState<List[]>(seedLists)
  const [categories, setCategories] = useState<Category[]>(CATEGORIES)

  const touch = useCallback((listId: string, updater: (l: List) => List) => {
    setLists((prev) =>
      prev.map((l) => (l.id === listId ? { ...updater(l), updatedAt: Date.now() } : l)),
    )
  }, [])

  const createList = useCallback((title: string) => {
    const id = nextId()
    setLists((prev) => [
      { id, title: title.trim() || "Untitled list", updatedAt: Date.now(), items: [] },
      ...prev,
    ])
    return id
  }, [])

  const addItem = useCallback(
    (listId: string, name: string, quantity: string, category: string) => {
      touch(listId, (l) => ({
        ...l,
        items: [
          ...l.items,
          {
            id: nextId(),
            name: name.trim(),
            quantity: quantity.trim() || undefined,
            done: false,
            category,
          },
        ],
      }))
    },
    [touch],
  )

  const toggleItem = useCallback(
    (listId: string, itemId: string) => {
      touch(listId, (l) => ({
        ...l,
        items: l.items.map((it) => (it.id === itemId ? { ...it, done: !it.done } : it)),
      }))
    },
    [touch],
  )

  const deleteItem = useCallback(
    (listId: string, itemId: string) => {
      touch(listId, (l) => ({ ...l, items: l.items.filter((it) => it.id !== itemId) }))
    },
    [touch],
  )

  const clearList = useCallback(
    (listId: string) => {
      touch(listId, (l) => ({ ...l, items: [] }))
    },
    [touch],
  )

  const addCategory = useCallback((name: string, emoji: string) => {
    setCategories((prev) => [
      ...prev,
      { id: nextId(), name: name.trim() || "New category", emoji: emoji || "🏷️" },
    ])
  }, [])

  const renameCategory = useCallback((id: string, name: string) => {
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)))
  }, [])

  const deleteCategory = useCallback((id: string) => {
    setCategories((prev) => prev.filter((c) => c.id !== id))
  }, [])

  const value = useMemo<StoreValue>(
    () => ({
      lists,
      categories,
      createList,
      addItem,
      toggleItem,
      deleteItem,
      clearList,
      addCategory,
      renameCategory,
      deleteCategory,
    }),
    [
      lists,
      categories,
      createList,
      addItem,
      toggleItem,
      deleteItem,
      clearList,
      addCategory,
      renameCategory,
      deleteCategory,
    ],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error("useStore must be used within StoreProvider")
  return ctx
}

export function timeAgo(ts: number) {
  const diff = Date.now() - ts
  const mins = Math.round(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}
