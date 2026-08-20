# Staging

Ten dokument opisuje utrzymanie bezpłatnego środowiska stagingowego aplikacji List Up!, odseparowanego od produkcji.

## Topologia

| Przeznaczenie | Git       | Vercel                                                         | Supabase                     |
| ------------- | --------- | -------------------------------------------------------------- | ---------------------------- |
| Produkcja     | `main`    | produkcyjny projekt List Up!                                   | produkcyjny projekt Supabase |
| Staging       | `staging` | osobny projekt `list-up-staging`, Production Branch: `staging` | osobny projekt Supabase      |

Staging jest osobnym projektem Vercel, a nie płatnym Custom Environment. Jego krótki produkcyjny adres `*.vercel.app` jest stałym publicznym adresem HTTPS. Aplikację chronią Supabase Auth i RLS, a endpoint dispatchera dodatkowo wymaga własnego sekretu.

Zmiany są promowane przez `feature/*` → `staging` → `main`. Hotfix wprowadzony na `main` należy przenieść z powrotem do `staging`, aby branche nie rozjechały się.

## Konfiguracja Vercel

Projekt `list-up-staging` korzysta z tego samego repozytorium co produkcja, ale w **Settings → Environments → Production → Branch Tracking** wskazuje branch `staging`.

W zakresie Production stagingowego projektu należy ustawić:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://<staging-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<staging-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<staging-service-role-key>
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<staging-vapid-public-key>
VAPID_PRIVATE_KEY=<staging-vapid-private-key>
VAPID_SUBJECT=mailto:<adres-kontaktowy>
NOTIFICATION_WEBHOOK_SECRET=<losowy-sekret-stagingu>
```

Produkcja i staging mają osobne pary VAPID oraz osobne sekrety webhooka. `NEXT_PUBLIC_VAPID_PUBLIC_KEY` jest publiczną częścią pary; klucz prywatny, service-role i sekret webhooka są wyłącznie serwerowe. Zmiana zmiennych Vercel wymaga nowego deploymentu.

Nie należy włączać ochrony wymagającej logowania do Vercel dla krótkiej domeny produkcyjnej stagingowego projektu. Supabase musi móc wywołać endpoint bez interaktywnej sesji Vercel; właściwą autoryzację zapewnia nagłówek `X-Notification-Secret`.

## Konfiguracja Supabase

W **Authentication → URL Configuration** stagingowego projektu należy ustawić Site URL na stały adres stagingu i dodać odpowiadające mu Redirect URLs.

Na potrzeby dispatchera Supabase Vault przechowuje dwa wpisy:

| Nazwa                         | Wartość                                                           |
| ----------------------------- | ----------------------------------------------------------------- |
| `notification_dispatch_url`   | `https://<staging-domain>/api/notifications/dispatch`             |
| `notification_webhook_secret` | identyczna jak `NOTIFICATION_WEBHOOK_SECRET` w stagingowym Vercel |

Cron `dispatch-pending-notifications` pozostaje wyłączony, dopóki endpoint nie zostanie wdrożony, a oba wpisy Vault nie zostaną ustawione i zweryfikowane. Pozostałe bezpieczne zadania (`delete-expired-list-items` i `cleanup-notification-history`) mogą działać niezależnie.

Po udanym teście endpointu cron retry można włączyć idempotentnie:

```sql
do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'dispatch-pending-notifications';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'dispatch-pending-notifications',
    '* * * * *',
    'select private.dispatch_pending_notifications();'
  );
end;
$$;
```

## Lokalna konfiguracja

`.env.local` wskazuje stagingowy Supabase podczas zwykłej pracy lokalnej. `.env.test.local` przechowuje konta E2E oraz stagingowy service-role. Oba pliki są ignorowane przez Git.

Sekrety VAPID i webhooka są potrzebne lokalnie tylko podczas świadomego testowania dispatchera. Zdalny Supabase nie wywoła `http://localhost:3000`; do pełnego testu Web Push należy użyć wdrożonego stagingu.

## Ręczne odtworzenie bazy na Free Plan

Free Plan nie udostępnia operacji „restore to a new project”, dlatego staging jest odtwarzany logicznym dumpem i restore.

1. Utwórz pusty projekt Supabase i zachowaj jego connection string.
2. Wyeksportuj role, schemat i dane produkcji osobno.
3. Nie kopiuj `vault.secrets`, `cron.*`, `net.*`, danych push/outbox ani nietrwałych danych Auth, takich jak sesje, refresh tokeny, MFA i flow state.
4. Zachowaj `auth.users`, `auth.identities`, `profiles` i dane aplikacyjne wymagane przez RLS oraz testy.
5. Przywróć role, schemat i dane do stagingu w jednej transakcji. Zarządzany Supabase może odmówić odtworzenia grantów parametrów serwera, np. `log_min_messages`; taki grant należy usunąć z kopii `roles.sql`, nie wyłączać obsługi pozostałych błędów.
6. Podczas importu danych użyj `session_replication_role = replica`, aby nie uruchamiać triggerów dla historycznych rekordów.
7. Po restore odtwórz obiekty użytkownika znajdujące się na zarządzanych schematach, których dump nie obejmuje: trigger synchronizacji profilu na `auth.users` oraz polityki prywatnego kanału na `realtime.messages`.
8. Zweryfikuj i odtwórz ACL tabel oraz funkcji. Pusty projekt Supabase może nadać `anon` domyślne uprawnienia, których nie było w źródle; RLS i ACL muszą blokować anonimowy dostęp.
9. Jeżeli źródło nie ma historii `supabase_migrations`, oznacz istniejące lokalne migracje jako zastosowane za pomocą `supabase migration repair`, a następnie sprawdź `migration list` i `db push --dry-run`.
10. Skonfiguruj Auth URLs, Realtime publication oraz tylko bezpieczne crony. Dispatcher włącz dopiero po wdrożeniu stagingowego endpointu i ustawieniu Vault.

Connection stringi, dump zawierający dane Auth i wszystkie wygenerowane sekrety są materiałem poufnym. Po zakończeniu należy usunąć dump z katalogu tymczasowego oraz wyczyścić zmienne PowerShell.

## Weryfikacja

Przed uznaniem stagingu za gotowy:

```powershell
npx.cmd supabase migration list --linked
npx.cmd supabase db push --linked --dry-run
npm.cmd run lint
npm.cmd run test:unit
npm.cmd run test:e2e
```

Oczekiwany stan:

- lokalne i zdalne migracje są zgodne, a dry-run nie proponuje zmian;
- anonimowy dostęp do tabel aplikacyjnych jest odrzucony;
- oba konta z allowlisty przechodzą logowanie i współdzielony CRUD;
- Postgres Changes oraz prywatny kanał Realtime działają;
- tabele push/outbox i Vault nie zawierają skopiowanych danych produkcyjnych;
- po skonfigurowaniu push chroniony endpoint zwraca `401` bez sekretu i poprawne podsumowanie z właściwym nagłówkiem;
- test mobilny rejestruje osobną subskrypcję stagingową i dostarcza wiadomość przy zamkniętym lub działającym w tle czacie.

## Dokumentacja zewnętrzna

- [Vercel: Production Branch i Preview Branches](https://vercel.com/docs/git)
- [Vercel: Environment Variables](https://vercel.com/docs/environment-variables)
- [Supabase Vault](https://supabase.com/docs/guides/database/vault)
- [Supabase: Backup and restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
