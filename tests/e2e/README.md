# Playwright E2E

## Configuration

Copy `.env.test.example` to `.env.test.local` and provide a Supabase Auth
account included in the database allowlist. `.env.test.local` is ignored by
Git. Variables already present in `.env.local` do not need to be duplicated.

The suite verifies login/logout, UI CRUD, persistence, relational CRUD,
database triggers, anonymous access denial, and category search. Every mutated
record uses a unique name and is removed during cleanup.

```dotenv
E2E_TEST_EMAIL=an-email-present-in-the-rls-allowlist@example.com
E2E_TEST_PASSWORD=replace-me
E2E_SECOND_USER_EMAIL=second-allowlisted-user@example.com
E2E_SECOND_USER_PASSWORD=replace-me
E2E_SUPABASE_SERVICE_ROLE_KEY=replace-me-for-tests-only
```

The second account and service-role value are only required by the chat RLS,
recipient, and notification-outbox integration test. Keep the service-role key
in the ignored `.env.test.local`; it must never be exposed to browser code.

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
