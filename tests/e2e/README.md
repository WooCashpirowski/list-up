# Playwright E2E

## Configuration

Copy `.env.test.example` to `.env.test.local` and provide a dedicated Supabase
Auth account. `.env.test.local` is ignored by Git.

The default database test verifies authentication, connectivity, and the RLS
result. Full CRUD is intentionally opt-in because it creates temporary data:

```dotenv
E2E_TEST_EMAIL=an-email-present-in-the-rls-allowlist@example.com
E2E_TEST_PASSWORD=replace-me
E2E_DB_CRUD=true
```

The CRUD test always attempts to remove its temporary list in `finally`.

## Commands

```shell
npm run test:e2e
npm run test:e2e:ui
npm run test:e2e:db
npm run test:e2e:headed
```
