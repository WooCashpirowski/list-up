"use client"

import { useState } from "react"
import { StoreProvider } from "@/components/store"
import { HomeView } from "@/components/home-view"
import { ListView } from "@/components/list-view"
import { CategoriesView } from "@/components/categories-view"
import { BottomNav, type Tab } from "@/components/bottom-nav"

export default function Page() {
  const [tab, setTab] = useState<Tab>("home")
  const [openListId, setOpenListId] = useState<string | null>(null)

  const inList = tab === "home" && openListId !== null

  return (
    <StoreProvider>
      <main className="min-h-dvh bg-background text-foreground">
        {tab === "home" &&
          (openListId ? (
            <ListView listId={openListId} onBack={() => setOpenListId(null)} />
          ) : (
            <HomeView onOpenList={(id) => setOpenListId(id)} />
          ))}

        {tab === "categories" && <CategoriesView />}

        {!inList && (
          <BottomNav
            active={tab}
            onChange={(t) => {
              setTab(t)
              setOpenListId(null)
            }}
            onLogout={() => {
              // prototype: reset to home
              setOpenListId(null)
              setTab("home")
            }}
          />
        )}
      </main>
    </StoreProvider>
  )
}
