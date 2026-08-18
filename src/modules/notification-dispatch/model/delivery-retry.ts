const RETRY_DELAYS_SECONDS = [60, 120, 300, 900] as const

export type PushFailureDecision = {
  status: 'retry' | 'dead'
  deactivateSubscription: boolean
  retryAfterSeconds: number | null
}

export function decidePushFailure(
  statusCode: number | null,
  attemptNumber: number,
): PushFailureDecision {
  const expired = statusCode === 404 || statusCode === 410
  const transient =
    statusCode === null ||
    statusCode === 408 ||
    statusCode === 429 ||
    statusCode >= 500
  const shouldRetry = !expired && transient && attemptNumber < 5

  return {
    status: shouldRetry ? 'retry' : 'dead',
    deactivateSubscription: expired,
    retryAfterSeconds: shouldRetry
      ? RETRY_DELAYS_SECONDS[
          Math.min(Math.max(attemptNumber - 1, 0), RETRY_DELAYS_SECONDS.length - 1)
        ]
      : null,
  }
}
