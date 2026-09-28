'use client'

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

import { useI18n } from '@/src/modules/i18n'
import { isBrowserOnline } from '@/src/modules/offline'
import { type GiphyGif, isGiphyConfigured, searchGiphy, trackGiphy } from '../services/giphy.service'
import { GiphyAttribution } from './giphy-attribution'

export function GifDrawer({ onClose, onSend }: {
  onClose: () => void
  onSend: (gif: GiphyGif) => Promise<boolean>
}) {
  const { locale, t } = useI18n()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GiphyGif[]>([])
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const viewed = useRef(new Set<string>())

  useEffect(() => {
    if (!isGiphyConfigured() || !isBrowserOnline()) return
    let alive = true
    const timer = window.setTimeout(() => {
      setLoading(true)
      void searchGiphy(query.trim(), offset, locale).then((items) => {
        if (!alive) return
        setResults((current) => offset === 0 ? items : [...current, ...items])
        setError(null)
      }).catch(() => { if (alive) setError(t('chat.gifLoadError')) })
        .finally(() => { if (alive) setLoading(false) })
    }, query ? 300 : 0)
    return () => { alive = false; window.clearTimeout(timer) }
  }, [locale, offset, query, t])

  return <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
    <section role="dialog" aria-modal="true" aria-label={t('chat.gifs')}
      className="surface-glass mx-auto flex max-h-[80dvh] w-full max-w-md flex-col rounded-t-3xl bg-card p-4"
      onClick={(event) => event.stopPropagation()}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">{t('chat.gifs')}</h2>
        <button type="button" onClick={onClose} aria-label={t('common.cancel')}><X /></button>
      </div>
      <input value={query} onChange={(event) => { setQuery(event.target.value); setOffset(0) }}
        maxLength={50} placeholder={t('chat.searchGifs')}
        className="mb-3 rounded-xl border border-input bg-secondary px-3 py-2" />
      {!isGiphyConfigured() ? <p role="alert">{t('chat.gifNotConfigured')}</p>
        : !isBrowserOnline() && results.length === 0 ? <p>{t('chat.gifOffline')}</p>
          : <div className="grid min-h-32 grid-cols-2 gap-2 overflow-y-auto">
            {results.map((gif) => <button key={gif.id} type="button"
              aria-label={gif.title || t('chat.gif')}
              onClick={async () => {
                trackGiphy(gif.analytics?.onclick?.url)
                if (await onSend(gif)) {
                  trackGiphy(gif.analytics?.onsent?.url)
                  onClose()
                }
              }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={gif.images.fixed_width?.url ?? gif.images.original?.url}
                alt={gif.title} onLoad={() => {
                  if (viewed.current.has(gif.id)) return
                  viewed.current.add(gif.id)
                  trackGiphy(gif.analytics?.onload?.url)
                }}
                className="w-full rounded-xl" />
            </button>)}
            {error && <p role="alert" className="col-span-2 text-destructive">{error}</p>}
            {loading && <p className="col-span-2">{t('chat.loadingGifs')}</p>}
            {results.length > 0 && !loading && <button type="button" className="col-span-2 py-2 text-primary"
              onClick={() => setOffset((current) => current + 20)}>{t('chat.moreGifs')}</button>}
          </div>}
      <div className="mt-3"><GiphyAttribution /></div>
    </section>
  </div>
}
