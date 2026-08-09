import { defineConfig, devices } from '@playwright/test'

import { loadPlaywrightEnv } from './tests/e2e/load-env'

loadPlaywrightEnv()

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100)
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`
const browserChannel = process.env.PLAYWRIGHT_CHANNEL

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    baseURL,
    locale: 'en-US',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: process.env.PLAYWRIGHT_DISABLE_VIDEO ? 'off' : 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testMatch: '**/*.ui.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        ...(browserChannel ? { channel: browserChannel } : {}),
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: 'supabase',
      testMatch: '**/*.db.spec.ts',
    },
  ],
  webServer: {
    command: `node ./node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
