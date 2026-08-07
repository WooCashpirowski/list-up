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
```

## Commands

```shell
npm run test:e2e
npm run test:e2e:ui
npm run test:e2e:db
npm run test:e2e:headed
```
