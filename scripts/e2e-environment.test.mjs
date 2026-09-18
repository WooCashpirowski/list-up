import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, isAbsolute, sep } from 'node:path'
import { root } from './local-runtime.mjs'

test('the actual E2E config ignores staging files and rejects a remote override by default', () => {
  const temporaryRoot = realpathSync(tmpdir())
  const directory = mkdtempSync(join(temporaryRoot, 'list-up-env-test-'))
  try {
    writeFileSync(join(directory, '.env.local'), 'NEXT_PUBLIC_SUPABASE_URL=http://localhost:44321\nNEXT_PUBLIC_SUPABASE_ANON_KEY=local-test-key\n')
    writeFileSync(join(directory, '.env.test.local'), 'NEXT_PUBLIC_SUPABASE_URL=https://staging.invalid\nNEXT_PUBLIC_SUPABASE_ANON_KEY=staging-test-key\n')
    const runConfig = (url) => {
      const env = { ...process.env, E2E_ENVIRONMENT: 'local' }
      delete env.NEXT_PUBLIC_SUPABASE_URL
      delete env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if (url) env.NEXT_PUBLIC_SUPABASE_URL = url
      return spawnSync(process.execPath, [join(root, 'node_modules/@playwright/test/cli.js'), 'test', '--list', '--config', join(root, 'playwright.db.config.ts')], {
        cwd: directory, env, encoding: 'utf8', windowsHide: true,
      })
    }
    const local = runConfig()
    assert.equal(local.status, 0, local.stderr)
    const remote = runConfig('https://remote.invalid')
    assert.notEqual(remote.status, 0)
    assert.match(remote.stderr + remote.stdout, /Local E2E requires the local Supabase API/)
  } finally {
    // Check the resolved target before recursively removing the test fixture.
    const rel = relative(temporaryRoot, realpathSync(directory))
    if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('Unsafe temporary fixture path')
    rmSync(directory, { recursive: true, force: true })
  }
})
