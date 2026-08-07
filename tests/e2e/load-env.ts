import { loadEnvFile } from 'node:process'

export function loadPlaywrightEnv(): void {
  for (const envFile of ['.env.test.local', '.env.local']) {
    try {
      loadEnvFile(envFile)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
  }
}
