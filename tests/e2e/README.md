# Playwright E2E

## Configuration

Start the Docker environment with `npm run local:up`, then run
`npm run test:e2e:local`. The generated `.env.local` contains local Supabase
keys and three confirmed test accounts. The default environment is local;
the loader never reads the staging `.env.test.local` implicitly. See the
[local runbook](../../docs/local-development.md).

For explicit staging runs use `npm run test:e2e:staging`. This loads
`.env.staging.local` and `.env.test.local` (copy `.env.test.example` and provide
three confirmed administrator-created staging accounts). Never run the database
or browser E2E suites against production. See the
[staging runbook](../../docs/staging.md) for the environment topology and
verification checklist.

The suite verifies login/logout, UI CRUD, persistence, relational CRUD,
database triggers, anonymous access denial, and category search. Every mutated
record uses a unique name and is removed during cleanup.

```dotenv
E2E_TEST_EMAIL=first-admin-created-user@example.com
E2E_TEST_PASSWORD=replace-me
E2E_SECOND_USER_EMAIL=second-admin-created-user@example.com
E2E_SECOND_USER_PASSWORD=replace-me
E2E_THIRD_USER_EMAIL=third-admin-created-user@example.com
E2E_THIRD_USER_PASSWORD=replace-me
E2E_SUPABASE_SERVICE_ROLE_KEY=replace-me-for-tests-only
```

The second and third accounts plus the service-role value are required by the
chat RLS, conversation-isolation, recipient, and notification-outbox integration
tests. Keep the service-role key in the ignored environment file; it must never
be exposed to browser code.

## Commands

```shell
npm run test:e2e
npm run test:e2e:ui
npm run test:e2e:db
npm run test:e2e:pwa
npm run test:e2e:headed
```

The PWA suite builds and starts the production application, then verifies that
the cached application shell can be reopened with the browser network disabled.
It does not require Supabase credentials. Install the Playwright Chromium binary
with `npx playwright install chromium` before running browser tests locally.
