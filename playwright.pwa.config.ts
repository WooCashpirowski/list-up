import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.PLAYWRIGHT_PWA_PORT ?? 3200)
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL,
    ...devices['Desktop Chrome'],
    viewport: { width: 390, height: 844 },
  },
  projects: [
    {
      name: 'pwa-chromium',
      testMatch: '**/*.pwa.spec.ts',
      use: { channel: 'chrome' },
    },
  ],
  webServer: {
    command: `node ./node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
