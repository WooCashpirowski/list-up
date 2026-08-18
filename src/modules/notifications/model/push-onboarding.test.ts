import { expect, test } from '@playwright/test'

import { shouldShowPushOnboarding } from './push-onboarding'

test('shows onboarding only for a supported browser with undecided permission', () => {
  expect(
    shouldShowPushOnboarding({
      support: 'available',
      permission: 'default',
      isEnabled: false,
      isDismissed: false,
    }),
  ).toBe(true)

  for (const permission of ['denied', 'granted', 'unsupported'] as const) {
    expect(
      shouldShowPushOnboarding({
        support: permission === 'unsupported' ? 'unsupported' : 'available',
        permission,
        isEnabled: permission === 'granted',
        isDismissed: false,
      }),
    ).toBe(false)
  }
})
