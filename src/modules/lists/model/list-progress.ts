import type {
  ListProgress,
  ListProgressItem,
} from '../types/list-progress.types'

export function buildListProgress(
  items: ListProgressItem[],
): Map<string, ListProgress> {
  const progressByList = new Map<string, ListProgress>()

  for (const item of items) {
    const progress = progressByList.get(item.list_id) ?? {
      total: 0,
      remaining: 0,
    }
    progress.total += 1
    if (!item.is_done) progress.remaining += 1
    progressByList.set(item.list_id, progress)
  }

  return progressByList
}

export function formatRelativeListTime(
  timestamp: string,
  locale: 'en' | 'pl',
  now = Date.now(),
): string {
  const difference = now - new Date(timestamp).getTime()
  const minutes = Math.round(difference / 60_000)
  const formatter = new Intl.RelativeTimeFormat(locale, {
    numeric: 'auto',
    style: 'narrow',
  })

  if (minutes < 1) return formatter.format(0, 'minute')
  if (minutes < 60) return formatter.format(-minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (hours < 24) return formatter.format(-hours, 'hour')
  return formatter.format(-Math.round(hours / 24), 'day')
}
