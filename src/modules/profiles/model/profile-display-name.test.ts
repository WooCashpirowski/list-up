import { expect, test } from '@playwright/test'

import { getProfileDisplayName } from './profile-display-name'

test('uses a trimmed display name and falls back to a readable email name', () => {
  expect(
    getProfileDisplayName({
      email: 'renata.piorowska@example.com',
      display_name: '  Renata  ',
    }),
  ).toBe('Renata')
  expect(
    getProfileDisplayName({
      email: 'renata.piorowska@example.com',
      display_name: null,
    }),
  ).toBe('Renata Piorowska')
})
