export function getErrorMessage(error: unknown): string {
  if (typeof error === 'string' && error.trim()) {
    return error.trim()
  }

  if (
    error !== null &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message.trim()
  ) {
    return error.message.trim()
  }

  return 'Something went wrong. Please try again.'
}
