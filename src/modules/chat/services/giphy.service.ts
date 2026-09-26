export type GiphyGif = {
  id: string
  title: string
  images: {
    fixed_width?: { url: string; width: string; height: string }
    original?: { url: string; width: string; height: string }
  }
  analytics?: {
    onload?: { url: string }
    onclick?: { url: string }
    onsent?: { url: string }
  }
}

const GIPHY_API_KEY = process.env.NEXT_PUBLIC_GIPHY_API_KEY

export function isGiphyConfigured(): boolean {
  return Boolean(GIPHY_API_KEY)
}

async function giphyRequest(path: string, params: Record<string, string>): Promise<GiphyGif[]> {
  if (!GIPHY_API_KEY) throw new Error('GIPHY API key is not configured')
  const url = new URL(`https://api.giphy.com/v1/gifs${path ? `/${path}` : ''}`)
  url.searchParams.set('api_key', GIPHY_API_KEY)
  url.searchParams.set('rating', 'g')
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('Could not load GIFs')
  const result = (await response.json()) as { data: GiphyGif[] }
  return result.data
}

export function searchGiphy(query: string, offset: number, locale: string): Promise<GiphyGif[]> {
  return giphyRequest(query ? 'search' : 'trending', {
    ...(query ? { q: query.slice(0, 50), lang: locale } : {}),
    limit: '20', offset: String(offset),
  })
}

export function getGiphyByIds(ids: string[]): Promise<GiphyGif[]> {
  return giphyRequest('', { ids: ids.join(',') })
}

export function trackGiphy(url: string | undefined): void {
  if (!url || !url.startsWith('https://giphy-analytics.giphy.com/')) return
  void fetch(url, { mode: 'no-cors', keepalive: true }).catch(() => undefined)
}
