import { defineConfig } from '@playwright/test'

import { loadPlaywrightEnv } from './tests/e2e/load-env'

loadPlaywrightEnv()

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  projects: [
    {
      name: 'supabase',
      testMatch: '**/*.db.spec.ts',
    },
  ],
})
