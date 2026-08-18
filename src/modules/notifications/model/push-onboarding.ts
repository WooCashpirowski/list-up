import type { PushPermissionState, PushSupport } from '../types/notification.types'

export function shouldShowPushOnboarding(input: {
  support: PushSupport
  permission: PushPermissionState
  isEnabled: boolean
  isDismissed: boolean
}): boolean {
  return (
    input.support === 'available' &&
    input.permission === 'default' &&
    !input.isEnabled &&
    !input.isDismissed
  )
}
