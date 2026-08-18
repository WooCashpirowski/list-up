import type { PushSubscriptionInput } from '../types/notification.types'

export interface NotificationsGateway {
  saveSubscription: (input: PushSubscriptionInput) => Promise<void>
  removeSubscription: (endpoint: string) => Promise<void>
}
