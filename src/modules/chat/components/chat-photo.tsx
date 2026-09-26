'use client'

import { useEffect, useMemo, useState } from 'react'

import { getChatPhoto } from '@/src/modules/offline'
import { createSupabaseChatGateway } from '../services/supabase-chat.gateway'
import type { ChatMessage } from '../types/chat.types'

export function ChatPhoto({ message, label }: { message: ChatMessage; label: string }) {
  const gateway = useMemo(() => createSupabaseChatGateway(), [])
  const [url, setUrl] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [onlineRevision, setOnlineRevision] = useState(0)

  useEffect(() => {
    const retry = () => setOnlineRevision((current) => current + 1)
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [])

  useEffect(() => {
    if (!message.media_path) return
    let alive = true
    let objectUrl: string | null = null
    const load = async () => {
      const blob = message.sequence === null
        ? await getChatPhoto(message.id)
        : await gateway.downloadPhoto(message.media_path!)
      if (!blob || !alive) return
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    }
    void load().catch(() => { if (alive) setUrl(null) })
    return () => {
      alive = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [gateway, message.id, message.media_path, message.sequence, onlineRevision])

  return <>
    {url ? <button type="button" onClick={() => setExpanded(true)} aria-label={label}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={label} className="max-h-72 max-w-full rounded-2xl object-contain" />
    </button> : <div role="img" aria-label={label}
      className="flex h-40 w-52 items-center justify-center rounded-2xl bg-secondary text-sm text-muted-foreground">
      {label}
    </div>}
    {expanded && url && <div role="dialog" aria-modal="true" aria-label={label}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4"
      onClick={() => setExpanded(false)}>
      <button type="button" className="absolute right-4 top-4 text-white" aria-label="Close">✕</button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={label} className="max-h-full max-w-full object-contain" />
    </div>}
  </>
}
