const PREVIEW_LIMIT = 120

export function createNotificationPreview(body: string): string {
  const normalized = body.replace(/\s+/g, ' ').trim()
  if (normalized.length <= PREVIEW_LIMIT) return normalized
  return `${normalized.slice(0, PREVIEW_LIMIT - 1).trimEnd()}…`
}
