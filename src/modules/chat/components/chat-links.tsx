const URL_PATTERN = /https?:\/\/[^\s<>"']+|(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d+)?(?:\/[^\s<>"']*)?/gi

export function ChatLinks({ body }: { body: string }) {
  const parts: React.ReactNode[] = []
  let cursor = 0
  for (const match of body.matchAll(URL_PATTERN)) {
    const start = match.index
    if (start === undefined) continue
    const previous = body[start - 1]
    if (previous && /[\w@:/]/.test(previous)) continue
    const raw = match[0]
    const urlText = raw.replace(/[.,!?;:)}\]]+$/, '')
    if (!urlText) continue
    const href = /^https?:\/\//i.test(urlText) ? urlText : `https://${urlText}`
    let valid = false
    try {
      const url = new URL(href)
      valid = ['http:', 'https:'].includes(url.protocol) && url.hostname.includes('.')
    } catch { /* Keep malformed text as text. */ }
    if (!valid) continue
    parts.push(body.slice(cursor, start))
    parts.push(<a key={start} href={href} target="_blank" rel="noopener noreferrer external"
      className="underline underline-offset-2 break-all">{urlText}</a>)
    cursor = start + urlText.length
  }
  parts.push(body.slice(cursor))
  return <>{parts}</>
}
