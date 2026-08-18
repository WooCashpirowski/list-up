'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { getErrorMessage } from '@/src/lib/get-error-message'

import { shouldShowPushOnboarding } from '../model/push-onboarding'
import { createSupabaseNotificationsGateway } from '../services/supabase-notifications.gateway'
import type {
  PushNotificationState,
  PushPermissionState,
  PushSubscriptionInput,
  PushSupport,
} from '../types/notification.types'

function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  return Uint8Array.from(raw, (character) => character.charCodeAt(0))
}

function arrayBufferToBase64Url(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return window
    .btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function toSubscriptionInput(
  subscription: PushSubscription,
): PushSubscriptionInput | null {
  const p256dh = subscription.getKey('p256dh')
  const auth = subscription.getKey('auth')
  if (!p256dh || !auth) return null

  return {
    endpoint: subscription.endpoint,
    p256dh: arrayBufferToBase64Url(p256dh),
    auth: arrayBufferToBase64Url(auth),
    userAgent: navigator.userAgent || null,
  }
}

function supportsPush(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  const current = await navigator.serviceWorker.getRegistration('/')
  if (current) return current

  if (process.env.NODE_ENV === 'production') {
    return navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    })
  }

  throw new Error('Service Worker is not registered')
}

export function usePushNotifications(userId: string): PushNotificationState {
  const gateway = useMemo(() => createSupabaseNotificationsGateway(), [])
  const dismissalKey = `list-up:push-onboarding-dismissed:${userId}`
  const [support, setSupport] = useState<PushSupport>('checking')
  const [permission, setPermission] = useState<PushPermissionState>('unsupported')
  const [isEnabled, setIsEnabled] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDismissed, setIsDismissed] = useState(false)

  const reconcile = useCallback(async () => {
    if (!supportsPush()) {
      setSupport('unsupported')
      setPermission('unsupported')
      setIsEnabled(false)
      return
    }

    setSupport('available')
    setPermission(Notification.permission)

    try {
      const registration = await navigator.serviceWorker.getRegistration('/')
      const subscription = await registration?.pushManager.getSubscription()

      if (subscription && Notification.permission === 'granted') {
        const input = toSubscriptionInput(subscription)
        if (input) await gateway.saveSubscription(input)
      }
      setIsEnabled(Boolean(subscription && Notification.permission === 'granted'))
      setError(null)
    } catch (nextError) {
      setIsEnabled(false)
      setError(getErrorMessage(nextError))
    }
  }, [gateway])

  useEffect(() => {
    const initialRefresh = window.requestAnimationFrame(() => {
      setIsDismissed(window.localStorage.getItem(dismissalKey) === 'true')
      void reconcile()
    })

    const handleFocus = () => void reconcile()
    window.addEventListener('focus', handleFocus)
    return () => {
      window.cancelAnimationFrame(initialRefresh)
      window.removeEventListener('focus', handleFocus)
    }
  }, [dismissalKey, reconcile])

  const enable = useCallback(async (): Promise<boolean> => {
    if (!supportsPush()) return false
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!publicKey) {
      setError('Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY')
      return false
    }

    setIsBusy(true)
    try {
      const nextPermission = await Notification.requestPermission()
      setPermission(nextPermission)
      if (nextPermission !== 'granted') return false

      const registration = await getServiceWorkerRegistration()
      const current = await registration.pushManager.getSubscription()
      const subscription =
        current ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }))
      const input = toSubscriptionInput(subscription)
      if (!input) throw new Error('Push subscription does not contain keys')

      await gateway.saveSubscription(input)
      window.localStorage.removeItem(dismissalKey)
      setIsDismissed(false)
      setIsEnabled(true)
      setError(null)
      return true
    } catch (nextError) {
      setError(getErrorMessage(nextError))
      return false
    } finally {
      setIsBusy(false)
    }
  }, [dismissalKey, gateway])

  const disable = useCallback(async (): Promise<boolean> => {
    if (!supportsPush()) return true
    setIsBusy(true)

    try {
      const registration = await navigator.serviceWorker.getRegistration('/')
      const subscription = await registration?.pushManager.getSubscription()
      if (subscription) {
        try {
          await gateway.removeSubscription(subscription.endpoint)
        } finally {
          await subscription.unsubscribe()
        }
      }
      setIsEnabled(false)
      setError(null)
      return true
    } catch (nextError) {
      setError(getErrorMessage(nextError))
      return false
    } finally {
      setIsBusy(false)
    }
  }, [gateway])

  const cleanupBeforeSignOut = useCallback(async (): Promise<void> => {
    if (!supportsPush()) return
    const registration = await navigator.serviceWorker.getRegistration('/')
    const subscription = await registration?.pushManager.getSubscription()
    if (!subscription) return

    try {
      await gateway.removeSubscription(subscription.endpoint)
    } finally {
      await subscription.unsubscribe()
      setIsEnabled(false)
    }
  }, [gateway])

  const dismissOnboarding = useCallback(() => {
    window.localStorage.setItem(dismissalKey, 'true')
    setIsDismissed(true)
  }, [dismissalKey])

  return {
    support,
    permission,
    isEnabled,
    isBusy,
    error,
    shouldShowOnboarding: shouldShowPushOnboarding({
      support,
      permission,
      isEnabled,
      isDismissed,
    }),
    enable,
    disable,
    dismissOnboarding,
    cleanupBeforeSignOut,
  }
}
