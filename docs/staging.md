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
NEXT_PUBLIC_GIPHY_API_KEY=<webowy-klucz-GIPHY>
SUPABASE_SERVICE_ROLE_KEY=<staging-service-role-key>
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<staging-vapid-public-key>
VAPID_PRIVATE_KEY=<staging-vapid-private-key>
VAPID_SUBJECT=mailto:<adres-kontaktowy>
NOTIFICATION_WEBHOOK_SECRET=<losowy-sekret-stagingu>
```

Szuflada GIF-ów wymaga osobnego klucza GIPHY dla aplikacji webowej. Zapytania
GIPHY wychodzą bezpośrednio z przeglądarki; klucz `NEXT_PUBLIC_GIPHY_API_KEY`
jest publiczny. Bez klucza szuflada pokazuje komunikat o braku konfiguracji.

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

`.env.staging.local` wskazuje stagingowy Supabase. `npm run dev:staging` wybiera to środowisko jawnie. `.env.test.local` przechowuje stagingowe konta E2E oraz service-role i jest czytany wyłącznie przy jawnym wyborze stagingu (`npm run test:e2e:staging`). Pliki są ignorowane przez Git.

`.env.local` jest generowany przez `npm run local:up` i wskazuje lokalny Supabase działający w Dockerze. Domyślne testy korzystają z tego środowiska. Zobacz [lokalne środowisko Docker](local-development.md).

Sekrety VAPID i webhooka są potrzebne lokalnie tylko podczas świadomego testowania dispatchera. Zdalny Supabase nie wywoła `http://localhost:3000`; do pełnego testu Web Push należy użyć wdrożonego stagingu.

## Użytkownicy stagingowi

Użytkownicy są członkami aplikacji na podstawie `private.app_users`. Tabelą zarządza trigger na `auth.users`; nie należy dopisywać do niej rekordów ręcznie. Potwierdzone konto utworzone w **Authentication → Users** automatycznie otrzymuje profil oraz po jednej rozmowie 1:1 z każdym dotychczasowym członkiem.

Publiczna rejestracja musi być wyłączona w ustawieniach Supabase Auth, również dla providera e-mail. To istotna granica bezpieczeństwa: aplikacja nie prowadzi własnej allowlisty adresów i ufa wyłącznie kontom utworzonym administracyjnie przy wyłączonej rejestracji.

Podczas przejścia ze starej wersji dwuosobowej zachowaj następującą kolejność:

1. W **Authentication → Sign In / Providers → Email** wyłącz **Allow new users to sign up**. Ustawienie `supabase/config.toml` zabezpiecza lokalny stack, ale ustawienie hostowanego projektu należy sprawdzić osobno w Dashboardzie.
2. Zastosuj wszystkie migracje, w tym `20260904120000_add_multi_user_direct_chat.sql` oraz `20260917120000_fix_chat_notification_recipient.sql`, gdy istnieją jeszcze tylko dwa dotychczasowe konta aplikacji. Historia starego czatu zostanie przypisana do ich rozmowy 1:1.
3. Wdróż nową wersję aplikacji, ale jeszcze nie dodawaj trzeciego konta.
4. Na urządzeniach obu istniejących użytkowników uruchom nową wersję online i poczekaj na opróżnienie kolejki offline. Migruje to cache i ewentualne wiadomości oczekujące do rozmowy z identyfikatorem. Na stagingu można zamiast tego wyczyścić dane witryny, jeżeli lokalna historia i outbox nie są potrzebne.
5. W **Authentication → Users → Add user → Create new user** utwórz kolejne konta z predefiniowanymi adresami i silnymi hasłami oraz włącz automatyczne potwierdzenie e-maila. Nie twórz rekordów bezpośrednim SQL-em.
6. Uruchom read-only skrypt `supabase/scripts/verify_staging_app_users.sql` w SQL Editorze. Dla `n` członków oczekuj `n × (n - 1) / 2` rozmów i `n × (n - 1)` rekordów read state.
7. Uzupełnij trzy pary `E2E_TEST_*`, `E2E_SECOND_USER_*` i `E2E_THIRD_USER_*` w ignorowanym `.env.test.local`.
8. Zaloguj się każdym kontem i przeprowadź testy współdzielonych list, kategorii oraz izolacji rozmów.

Nie usuwaj istniejących użytkowników z historią czatu podczas zwykłego wdrożenia. Klucze obce celowo chronią historię rozmów; wycofanie konta wymaga osobnej, świadomej procedury retencji danych.

### Naprawa wysyłania wiadomości po migracji wieloużytkownikowej

Pierwsza migracja czatu zawierała konflikt nazwy zmiennej `recipient_id` z kolumną tabeli w triggerze powiadomień. Błąd PostgreSQL `42702` przerywał całą transakcję zapisu wiadomości. Naprawa zastępuje wyłącznie funkcję triggera, bez usuwania historii i bez zmiany RLS.

1. W katalogu projektu uruchom `npx.cmd supabase db push --linked --dry-run`. Jeżeli poprzednia migracja jest już zastosowana, plan powinien zawierać `20260917120000_fix_chat_notification_recipient.sql` oraz późniejsze migracje, jeśli nie zostały jeszcze zastosowane.
2. Uruchom `npx.cmd supabase db push --linked`.
3. Wdróż aktualną wersję aplikacji. Obsługa błędów odczytuje teraz również pole `message` ze zwykłych obiektów błędów Supabase, zamiast zastępować je ogólnym komunikatem.
4. Odśwież aplikację na obu kontach testowych i wyślij po jednej wiadomości w dotychczasowej rozmowie. Sprawdź odbiór oraz potwierdzenia dostarczenia i odczytu.
5. Po udanym teście kontynuuj dodawanie trzeciego użytkownika. Kolejny dry-run powinien potwierdzić brak zaległych migracji.

### Naprawa statusu „Delivered” w czasie rzeczywistym

Migracja `20260917130000_fix_chat_receipt_sequence.sql` zastępuje wyłącznie funkcję `private.broadcast_chat_receipt()`. Zdarzenie `delivered` używa teraz `last_delivered_sequence`, a zdarzenie `read` — `last_read_sequence`. Poprzednia funkcja wybierała starszy kursor odczytu również dla potwierdzenia dostarczenia, przez co nadawca mógł nadal widzieć „Sent”, mimo prawidłowego odbioru wiadomości. Historia, zapisane kursory, RLS i powiadomienia push pozostają bez zmian.

1. Sprawdź, czy projekt zapisany w `supabase/.temp/project-ref` odpowiada stagingowemu projektowi w Dashboardzie Supabase.
2. Uruchom `npx.cmd supabase db push --linked --dry-run`. Jeżeli wcześniejsze migracje są zastosowane, plan powinien wskazać tylko `20260917130000_fix_chat_receipt_sequence.sql`.
3. Uruchom `npx.cmd supabase db push --linked`. Poprawka działa po stronie bazy i nie wymaga nowego deploymentu aplikacji.
4. Powtórz test manualny w rozmowie z wcześniejszą historią odczytu: nadawca pozostaje w czacie, a odbiorca ma aplikację online na ekranie Home. Po nowej wiadomości nadawca powinien zobaczyć „Delivered” bez odświeżenia; po wejściu odbiorcy do rozmowy — „Read”.
5. Powtórz poprawiony scenariusz UI. Na pozostałych urządzeniach zamknij te same konta testowe, aby nie oznaczały wiadomości jako odczytanych równolegle. Jeżeli korzystasz z już uruchomionego dev serwera pod `http://localhost:3000`, w osobnym terminalu PowerShell wykonaj:

   ```powershell
   $env:PLAYWRIGHT_BASE_URL = 'http://localhost:3000'
   $env:PLAYWRIGHT_PORT = '3000'
   npx.cmd playwright test tests/e2e/chat.ui.spec.ts tests/e2e/realtime.ui.spec.ts --project=chromium
   ```

   Adres musi zgadzać się z hostem dev serwera, aby Next.js nie blokował zasobów deweloperskich. Bez uruchomionego serwera i tych zmiennych Playwright uruchamia własny serwer pod domyślnym adresem `http://127.0.0.1:3100`.
6. Kolejny `npx.cmd supabase db push --linked --dry-run` powinien potwierdzić brak zaległych migracji.

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
- wszystkie trzy administracyjnie utworzone konta przechodzą logowanie i współdzielony CRUD;
- każde konto widzi po jednej rozmowie z pozostałymi użytkownikami, a nieuczestniczące trzecie konto nie może odczytać wiadomości obcej pary;
- Postgres Changes oraz prywatne kanały Realtime rozdzielone według rozmowy działają;
- tabele push/outbox i Vault nie zawierają skopiowanych danych produkcyjnych;
- po skonfigurowaniu push chroniony endpoint zwraca `401` bez sekretu i poprawne podsumowanie z właściwym nagłówkiem;
- test mobilny rejestruje osobną subskrypcję stagingową i dostarcza wiadomość przy zamkniętym lub działającym w tle czacie.

## Dokumentacja zewnętrzna

- [Vercel: Production Branch i Preview Branches](https://vercel.com/docs/git)
- [Vercel: Environment Variables](https://vercel.com/docs/environment-variables)
- [Supabase Vault](https://supabase.com/docs/guides/database/vault)
- [Supabase: Backup and restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
