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
| `notification_dispatch_url`   | `https://list-up-staging.vercel.app/api/notifications/dispatch`   |
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

## Weryfikacja Web Push

Po wdrożeniu endpointu i włączeniu crona wykonaj test między dwoma kontami na
różnych urządzeniach lub w różnych profilach przeglądarki:

1. Na koncie odbiorcy włącz powiadomienia i zaakceptuj zgodę przeglądarki.
2. Zamknij kartę z czatem albo pozostaw ją w tle.
3. Z drugiego konta wyślij pojedynczą, rozpoznawalną wiadomość.
4. Sprawdź wyświetlenie powiadomienia i przejście do czatu po jego kliknięciu.

Powiadomienie jest celowo pomijane, gdy czat odbiorcy jest aktywny na pierwszym
planie. Kolejne powiadomienia czatu używają wspólnego tagu i mogą zastępować się
w systemowym centrum powiadomień.

Czas obsługi po stronie serwera można sprawdzić bez odczytywania treści wiadomości:

```sql
select
  event.created_at as event_created_at,
  delivery.status,
  delivery.attempts,
  delivery.last_status_code,
  delivery.last_error,
  delivery.sent_at,
  round(
    extract(epoch from (delivery.sent_at - event.created_at))::numeric,
    2
  ) as dispatch_seconds
from public.notification_deliveries as delivery
join public.notification_events as event
  on event.id = delivery.event_id
order by event.created_at desc
limit 20;
```

Typowy udany wynik to `status = 'sent'`, `attempts = 1`, brak `last_error` i
czas poniżej kilku sekund. Status `201` oznacza, że zewnętrzna usługa Web Push
przyjęła powiadomienie; nie gwarantuje chwili jego wyświetlenia przez system
operacyjny urządzenia.

## Lokalna konfiguracja

`.env.local` wskazuje stagingowy Supabase podczas zwykłej pracy lokalnej. `.env.test.local` przechowuje konta E2E oraz stagingowy service-role. Oba pliki są ignorowane przez Git.

Sekrety VAPID i webhooka są potrzebne lokalnie tylko podczas świadomego testowania dispatchera. Zdalny Supabase nie wywoła `http://localhost:3000`; do pełnego testu Web Push należy użyć wdrożonego stagingu.

## Użytkownicy stagingowi

Allowlista jest przechowywana w `private.allowed_user_emails`, dzięki czemu produkcja i staging mogą używać innych adresów bez rozbieżności schematu. Migracja tworząca tabelę inicjalizuje ją z istniejących profili, więc samo zastosowanie migracji nie zmienia dostępu.

Po migracji skopiuj zawartość `supabase/scripts/configure_staging_allowed_emails.sql` do SQL Editora stagingowego projektu, zastąp oba placeholdery adresami testowymi i uruchom skrypt. Nie zapisuj rzeczywistych adresów w śledzonym pliku.

Nie dodawaj nowych użytkowników obok sklonowanych kont. Aplikacja zakłada dwóch uczestników, a dodatkowe profile zaburzyłyby wybór odbiorcy czatu i powiadomień. Jeżeli historia czatu nie jest potrzebna, wyczyść czat, read state, push i outbox, usuń sklonowanych użytkowników przez Supabase Auth, a następnie utwórz dwa nowe, potwierdzone konta odpowiadające stagingowej allowliście.

Po ustawieniu nowych adresów w allowliście, ale przed utworzeniem nowych kont Auth, uruchom w stagingowym SQL Editorze `supabase/scripts/reset_staging_identity_data.sql`. Skrypt usuwa dane w jednej transakcji i odmawia działania, jeśli allowlista nadal pasuje do istniejącego użytkownika Auth. Następnie:

1. Upewnij się, że migracja `20260820130000_allow_system_created_by_cleanup.sql` jest zastosowana. Pozwala ona wewnętrznym akcjom `ON DELETE SET NULL` wyczyścić audytowe `created_by`, nadal blokując zmianę tego pola przez klienta.
2. Usuń sklonowanych użytkowników w **Authentication → Users**. Nie usuwaj rekordów `auth.users` bezpośrednim SQL-em.
3. Sprawdź, czy stare rekordy `public.profiles` zniknęły kaskadowo. Zachowane listy, kategorie i elementy pozostają, a ich `created_by` zmienia się na `null`.
4. Utwórz dokładnie dwa nowe konta z adresami z allowlisty, silnymi hasłami stagingowymi i potwierdzonym e-mailem. Trigger utworzy odpowiadające profile.
5. Zaktualizuj `E2E_TEST_EMAIL`, `E2E_TEST_PASSWORD`, `E2E_SECOND_USER_EMAIL` i `E2E_SECOND_USER_PASSWORD` w ignorowanym `.env.test.local`.
6. Usuń lokalną sesję i cache witryny stagingowej, zaloguj się ponownie i uruchom pełną weryfikację.

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
