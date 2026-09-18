# Lokalne środowisko Docker

Frontend Next.js razem z endpointami API działa w Docker Compose. Supabase CLI
uruchamia w Dockerze PostgreSQL 17, Auth, REST API, Realtime, Storage, Studio
oraz lokalny serwer e-mail. Wersja CLI jest przypięta w package-lock.json.

Docker Desktop pokazuje dwie grupy: `list-up-supabase` zarządzaną przez
Supabase CLI oraz `list-up-frontend` zarządzaną przez Docker Compose.
Komendy `local:up` i `local:down` obsługują obie grupy.

Opcjonalna lokalna analityka Logflare/Vector jest wyłączona. W tej wersji CLI
Vector na Windows wymaga dostępu do Dockera przez TCP na porcie 2375 i nie
montuje socketu. Logi usług są dostępne przez Docker; konfiguracja nie wymaga
udostępniania niezabezpieczonego API Docker Desktop.

## Wymagania i pierwszy start

- Node.js 22 i npm na komputerze.
- Uruchomiony Docker Desktop z kontenerami Linux (Windows: backend WSL 2).
- Internet do pierwszego pobrania obrazów i pakietów.

```shell
npm ci
npm run local:up
```

Skrypt stosuje migracje na nowej bazie, generuje ignorowany `.env.local`
z lokalnymi kluczami, osobną parą VAPID i sekretem webhooka, a następnie
tworzy lub aktualizuje trzy potwierdzone konta przez Auth Admin API:
`test1@test.com`, `test2@test.com`, `test3@test.com`. Domyślne hasło lokalne
każdego konta na nowej instalacji to `local-test123+-`. Dane kont można zmienić
w `.env.local`; istniejące wartości, w tym indywidualne hasła, są zachowywane.
Publiczna rejestracja pozostaje wyłączona.

Ponowny start zachowuje dane. Pliki `.env.staging.local`, `.env.prod.local`
oraz stagingowy `.env.test.local` pozostają osobne. Nie są kopiowane do obrazu
ani montowane do kontenera. Kod aplikacji jest montowany do kontenera i
odświeża się automatycznie; po zmianie zależności uruchom ponownie `local:up`.

| Usługa | Adres |
| --- | --- |
| Aplikacja | http://localhost:3000 |
| Supabase API | http://localhost:44321 |
| PostgreSQL | localhost:44322 |
| Studio | http://localhost:44323 |
| Podgląd e-maili | http://localhost:44324 |

Porty Supabase są poniżej dynamicznego zakresu TCP Windows (49152–65535),
w którym Docker Desktop/WSL może rezerwować domyślne porty 5432x po restarcie.
`local:up` aktualizuje również starszy `.env.local` z portem 54321, zachowując
hasła kont i lokalne sekrety. Wolumeny mają te same nazwy; zmiana portów nie
resetuje danych.

Przeglądarka korzysta z `NEXT_PUBLIC_SUPABASE_URL=http://localhost:44321`.
Serwer w kontenerze używa `SUPABASE_URL=http://host.docker.internal:44321`.
Lokalny webhook z PostgreSQL trafia na
`http://host.docker.internal:3000/api/notifications/dispatch`.
Na Linux Compose dodaje mapowanie `host-gateway`; Docker Engine musi
obsługiwać tę opcję. Środowisko jest weryfikowane na Docker Desktop.

## Obsługa

```shell
npm run local:status
npm run local:logs
npm run local:seed
npm run local:down
```

`local:seed` dodaje przykładową listę „Lokalne zakupy” i produkt „Mleko”.
`local:down` zatrzymuje usługi i zachowuje bazę oraz pliki Storage. Nie używa
opcji `--no-backup` ani usuwania wolumenów. Ponowny start: `local:up`.

```shell
npm run local:reset
```

Reset zastępuje lokalną bazę migracjami i danymi demonstracyjnymi oraz wyłącza
dispatcher. Nie odtwarza snapshotu. Reset i restore używają jawnego `--local`
oraz kontenera `supabase_db_list-up-supabase`; nie mają zdalnego adresu docelowego
ani fallbacku na projekt linked.

## Kopia stagingu

Eksport wymaga dostępu Supabase CLI do projektu wskazanego w
`supabase/.temp/project-ref` oraz zmiennych `NEXT_PUBLIC_SUPABASE_URL`
i `SUPABASE_SERVICE_ROLE_KEY` w `.env.staging.local`. Skrypt porównuje linked
project ze stagingowym URL, odrzuca URL produkcji i sprawdza historię migracji.
Eksport nie uruchamia zdalnego push/reset/repair.

```shell
npm run local:snapshot
npm run local:restore
```

Oba kroki można wykonać jedną komendą:

```shell
npm run local:refresh
```

`snapshot` tylko odczytuje staging. `restore` i `refresh` **zastępują lokalną
bazę oraz lokalne buckety Storage**. Snapshot trafia do ignorowanego
`.local/snapshots/`; `.local/latest-snapshot` wybiera ostatni udany eksport.
Starszą kopię odtworzysz przez
`npm run local:restore -- .local/snapshots/<katalog>`.

Kopiowane są `auth.users`, `auth.identities`, `private.app_users`, profile,
kategorie, listy, pozycje, rozmowy, wiadomości i kursory odczytu. UUID i historia
pozostają zachowane. Sesje, MFA, refresh tokeny, Vault, stan cronów i sieci,
subskrypcje push oraz kolejki powiadomień są pomijane; tokeny odzyskiwania kont
są czyszczone w lokalnym Auth. Hasła podanych trzech kont zmieniają się wyłącznie
lokalnie. Brakujące konta są dodawane przez API, razem z profilami i rozmowami.

Restore odtwarza schemat z migracji, wczytuje dane w transakcji bez triggerów
historycznych i sprawdza klucze obce oraz członkostwo. Sumy kontrolne sprawdza
przed resetem. Migracje snapshotu muszą odpowiadać bieżącemu checkoutowi.
Zmiany schematu wykonane poza migracjami trzeba najpierw dodać do repozytorium.
Dump danych Auth zawiera hashe haseł i jest poufny; nie należy go commitować
ani udostępniać. Kopię można usunąć po zakończeniu pracy.

Storage jest kopiowany osobno przez API: ustawienia bucketów i zawartość plików.
Eksport PostgreSQL jest spójny w jednym momencie, ale pliki Storage pobierane są
później; podczas eksportu danych z plikami nie zmieniaj ich na stagingu.
Obiekty są uploadowane przez lokalne service-role; polityki zależne od właściciela
obiektu wymagają osobnego dostosowania. Obecna aplikacja nie korzysta z plików Storage.

## Testy

```shell
npm run test:infra
npm run test:unit
npx playwright install chromium
npm run test:e2e:local
```

Lokalny E2E korzysta z kontenera pod `http://localhost:3000` i danych z
`.env.local`. Na czas testów wyłącza webhook i cron powiadomień, a potem
przywraca preferencję lokalnego push. Zwykłe `npm run test:e2e` również korzysta
z lokalnego Supabase, lecz może uruchomić własny frontend na porcie 3100.
Domyślny loader nie czyta `.env.test.local` i odrzuca zdalne URL.

Staging wybiera się jawnie:

```shell
npm run dev:staging
npm run test:e2e:staging
```

Komendy wymagają `.env.staging.local`; testy dodatkowo czytają stagingowe konta
z `.env.test.local`. Stagingowy frontend może użyć innego portu przez
`npm run dev:staging -- --port 3001`, gdy lokalny zajmuje port 3000.
Nigdy nie kieruj E2E na produkcję.

## Powiadomienia

```shell
npm run local:push -- on
npm run local:push -- off
```

Push jest domyślnie wyłączony. Włączenie ustawia wyłącznie lokalne sekrety Vault
i uruchamia cron dispatchera; wyłączenie usuwa wpisy Vault i zatrzymuje cron,
aby także trigger wiadomości nie wywoływał endpointu. Preferencja jest zapisywana
w `.env.local`. Reset i restore zawsze ją wyłączają.

Web Push wymaga dostępu do zewnętrznych usług przeglądarki. Do testów na telefonie
potrzebny jest dostępny z telefonu adres HTTPS; `localhost` oznacza samo urządzenie.
Na komputerze powiadomienia można testować z dwiema sesjami przeglądarki.

## Rozwiązywanie problemów

- Pierwszy start trwa dłużej przez pobieranie obrazów i kompilację frontendu.
- Przy konflikcie portów sprawdź inne lokalne stacki Supabase i serwery Next.js.
- Jeśli Windows zgłasza `bind: An attempt was made to access a socket in a way
  forbidden by its access permissions`, sprawdź rezerwacje poleceniem
  `netsh interface ipv4 show excludedportrange protocol=tcp`. Używane porty
  nie mogą należeć do tych zakresów; uruchom ponownie `local:up` po zmianie
  konfiguracji. Usuwanie wolumenów ani reset bazy nie rozwiązuje blokady portu.
- Jeśli frontend nie startuje, sprawdź `local:logs` i `docker compose ps`.
- Po zmianie CLI sprawdź instrukcję aktualizacji Supabase i zachowaj snapshot
  przed usunięciem kontenerów lub wolumenów wymaganym przez aktualizację.
- Po zmianie migracji istniejącej bazy użyj `local:reset` albo ponownie wyeksportuj
  staging i wykonaj `local:restore`. Obie komendy zastępują lokalne dane.

Źródła: [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started),
[backup i restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore),
[sieć Docker Desktop](https://docs.docker.com/desktop/features/networking/),
[rezerwacje portów Windows](https://learn.microsoft.com/en-us/troubleshoot/windows-server/networking/error-10013-wsaeacces-is-returned).
