export type PushSupport = 'checking' | 'available' | 'unsupported'

export type PushPermissionState = NotificationPermission | 'unsupported'

export type PushSubscriptionInput = {
  endpoint: string
  p256dh: string
  auth: string
  userAgent: string | null
}

export type PushNotificationState = {
  support: PushSupport
  permission: PushPermissionState
  isEnabled: boolean
  isBusy: boolean
  error: string | null
  shouldShowOnboarding: boolean
  enable: () => Promise<boolean>
  disable: () => Promise<boolean>
  dismissOnboarding: () => void
  cleanupBeforeSignOut: () => Promise<void>
}
