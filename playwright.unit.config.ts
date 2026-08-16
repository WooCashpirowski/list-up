import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './src/modules',
  testMatch: '**/model/*.test.ts',
  outputDir: './test-results/unit',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: [['list']],
})
