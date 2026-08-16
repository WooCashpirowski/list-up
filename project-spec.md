# Specyfikacja aplikacji: List Up!

## 1. Cel i zakres

List Up! to prywatna, współdzielona aplikacja PWA do zarządzania listami zakupów i listami zadań. Dane są dostępne dla dwóch z góry wskazanych użytkowników i synchronizowane między ich urządzeniami w czasie rzeczywistym.

Aplikacja działa w modelu offline-ready: po wcześniejszym uruchomieniu online interfejs i zapisane dane są dostępne bez sieci, a lokalne zmiany trafiają do kolejki i synchronizują się automatycznie po odzyskaniu połączenia.

## 2. Stack technologiczny

- Next.js 16 z App Routerem
- React 19 i TypeScript w trybie strict
- Tailwind CSS 4, `clsx` i `tailwind-merge`
- Supabase: PostgreSQL, Auth, Row Level Security i Realtime
- IndexedDB do lokalnego cache oraz kolejki zmian offline
- Service Worker i Web App Manifest dla PWA
- dnd-kit do obsługi Drag & Drop
- next-themes do obsługi motywu
- Playwright do testów jednostkowych modeli oraz testów E2E interfejsu, PWA i bazy danych

## 3. Architektura aplikacji

Kod jest podzielony domenowo w katalogu `src/modules`. Główne moduły to:

- `app-shell` — powłoka aplikacji, nawigacja, rejestracja PWA i komunikaty globalne;
- `auth` — sesja i logowanie przez Supabase Auth;
- `lists` — listy zakupowe i todo;
- `list-items` — elementy list, kompozytor, autouzupełnianie i obsługa wykonania;
- `categories` — słownik kategorii i przypisanych fraz;
- `offline` — cache IndexedDB, outbox i synchronizacja zmian;
- `i18n` — polska i angielska wersja interfejsu;
- `profiles` — model profilu użytkownika.

Każda domena może zawierać warstwy `components`, `hooks`, `model`, `gateways`, `services` i `types`. Komponenty odpowiadają za prezentację i obsługę interakcji, `model` zawiera czyste, niezależne od Reacta transformacje danych, hooki zarządzają stanem, orkiestrują przypadki użycia i memoizują modele pochodne, `gateways` definiują porty wymaganej infrastruktury, a `services` zawierają ich adaptery oraz integrację z Supabase lub pamięcią lokalną. Grupowanie elementów list, kolejność pozycji wykonanych, katalog i filtrowanie kategorii oraz postęp list są wyliczane w warstwie `model`, poza komponentami widoków.

Granice modułów są wyrażone przez publiczne API w pliku `src/modules/<moduł>/index.ts`. Kod spoza modułu importuje wyłącznie z tego pliku, bez odwołań do jego wewnętrznych katalogów. Publiczne API korzysta z jawnych eksportów; elementy niewyeksportowane z głównego `index.ts` są szczegółami implementacyjnymi. Kod wewnątrz modułu używa importów względnych do własnych warstw. Komponenty widoków przyjmują należące do konsumenta, minimalne kontrakty danych zamiast zależeć od pełnych typów encji sąsiedniej domeny. Reguły ESLint automatycznie blokują importy wewnętrznych ścieżek obcych modułów oraz zależności `src/lib` od domen.

Warstwa współdzielona `src/lib` nie zależy od modułów domenowych. W szczególności `src/lib/supabase/database.types.ts` jest samodzielnym kontraktem schematu persistence. Typy rekordów bazy oraz typy domenowe są rozdzielone, a konwersja reprezentacji, które nie są równoważne, odbywa się w mapperach należących do serwisów odpowiedniego modułu. Pozwala to zmieniać reprezentację Supabase bez odwracania kierunku zależności i bez ujawniania DTO bazy w publicznym API domen.

Hooki domenowe nie importują klienta ani typów zdarzeń Supabase. Korzystają z portów gatewayów dla uwierzytelniania, list, kategorii, elementów i synchronizacji offline. Domyślne adaptery Supabase są umieszczone w `services`, mapują payloady Realtime na neutralny kontrakt zmiany kolekcji i odpowiadają za zwalnianie subskrypcji. ESLint ogranicza bezpośrednie importy Supabase do warstwy `services`.

Stan przeznaczony wyłącznie dla bieżącej interakcji, np. wyszukiwanie, zwinięcie sekcji i kolejność kategorii po Drag & Drop, pozostaje lokalny. Dane współdzielone są aktualizowane optymistycznie, zapisywane w Supabase i scalane przyrostowo na podstawie zdarzeń Realtime.

Nawigacja między głównymi widokami jest sterowana adresem URL i natywnym History API przeglądarki. URL stanowi jedyne źródło stanu aktywnej zakładki i otwartej listy, natomiast wspólna warstwa danych, cache i subskrypcje Realtime pozostają zamontowane podczas przejść między widokami.

## 4. Model danych

### `profiles`

- `id: uuid` — klucz zgodny z `auth.users.id`;
- `email: text`;
- `created_at`, `updated_at`.

### `lists`

- `id: uuid`;
- `title: text`;
- `list_type: shopping | todo`;
- `created_by: uuid | null`;
- `created_at`, `updated_at`.

Typ listy jest wybierany podczas tworzenia i nie może zostać później zmieniony. Ograniczenie jest egzekwowane również przez constraint i trigger w bazie danych.

### `categories`

- `id: uuid`;
- `name: text`;
- `order_index: integer`;
- `keywords: jsonb` — tablica nazw produktów lub fraz używana przez podpowiedzi i automatyczne dopasowanie;
- `created_by: uuid | null`;
- `created_at`, `updated_at`.

### `list_items`

- `id: uuid`;
- `list_id: uuid`;
- `category_id: uuid | null`;
- `name: text`;
- `quantity: text | null`;
- `is_done: boolean`;
- `done_at: timestamptz | null`;
- `created_by: uuid | null`;
- `created_at`, `updated_at`.

Usunięcie listy usuwa jej elementy kaskadowo. Usunięcie kategorii pozostawia elementy i ustawia ich `category_id` na `null`. Triggery bazy utrzymują pola `updated_at`, `created_by` oraz spójność `is_done` z `done_at`. Zmiana elementu aktualizuje także `updated_at` jego listy.

## 5. Uwierzytelnianie i bezpieczeństwo

- Logowanie odbywa się adresem e-mail i hasłem przez Supabase Auth.
- Dostęp do danych aplikacji mają wyłącznie dwa potwierdzone konta znajdujące się na allowliście.
- RLS jest włączone dla wszystkich tabel publicznych.
- Użytkownik anonimowy oraz konto spoza allowlisty nie mogą odczytywać ani modyfikować danych.
- Obaj dopuszczeni użytkownicy pracują na jednym współdzielonym zbiorze list, kategorii i elementów.
- Pole `created_by` ma charakter audytowy i jest ustawiane po stronie bazy na podstawie bieżącej sesji.

## 6. Funkcjonalności

### 6.1. Powłoka, nawigacja i personalizacja

- Główna nawigacja dolna zawiera widoki list i kategorii oraz akcję wylogowania.
- Widok wszystkich list używa adresu `/`, konkretna lista `/?list=<list_id>`, a kategorie `/?view=categories`.
- Otwarcie widoku dodaje wpis do historii przez `window.history.pushState`, dzięki czemu systemowy przycisk Back, gest powrotu na urządzeniu mobilnym oraz nawigacja Forward odtwarzają poprzedni widok bez przeładowania strony.
- Odświeżenie lub bezpośrednie otwarcie adresu konkretnej listy przywraca ten widok po uwierzytelnieniu i załadowaniu danych. Nieistniejący identyfikator listy jest zastępowany adresem widoku wszystkich list.
- Przycisk powrotu wewnątrz listy używa istniejącego wpisu historii, jeżeli lista została otwarta z aplikacji. Przy bezpośrednim wejściu zastępuje bieżący adres widokiem wszystkich list, aby nie przenosić użytkownika poza aplikację.
- Przełączniki języka i motywu są umieszczone w prawym górnym obszarze nagłówka i pozostają dostępne na ekranie logowania oraz we wszystkich głównych widokach, również wewnątrz listy i w kategoriach.
- Interfejs obsługuje język polski i angielski. Wybór jest zapisywany w `localStorage`; przy braku ustawienia używany jest język przeglądarki.
- Dostępne są jasny i ciemny motyw. Pierwsze ustawienie respektuje preferencję systemową, a ręczny wybór jest zapamiętywany.
- UI jest projektowane mobile-first, z szerokością roboczą zoptymalizowaną dla telefonu i obsługą bezpiecznych obszarów PWA.

### 6.2. Widok główny — listy

- Listy są sortowane malejąco według `updated_at`.
- Karta pokazuje tytuł, typ listy, liczbę elementów, postęp i informację o ostatniej aktywności.
- Użytkownik może utworzyć listę, zmienić jej nazwę i ją usunąć.
- Kartę listy można usunąć również pełnym swipe'em w lewo lub w prawo. Po rozpoczęciu gestu odsłaniane jest tło błędu z ikoną kosza, a po przekroczeniu progu gest uruchamia to samo potwierdzenie i tę samą mutację co przycisk usuwania.
- Podczas tworzenia wybiera typ `shopping` albo `todo`; edycja nazwy nie pozwala zmienić typu.
- Po utworzeniu lista jest od razu otwierana.
- Mutacje są realizowane jako Optimistic UI.

### 6.3. Lista zakupowa

- Element składa się z nazwy, opcjonalnej ilości i kategorii.
- Pole nazwy udostępnia podpowiedzi na podstawie słownika `keywords` kategorii.
- Kategoria może zostać wskazana ręcznie albo dopasowana automatycznie.
- Jeżeli nazwa nie pasuje do słownika, modal pozwala przypisać ją do wybranej kategorii i rozszerzyć jej słownik albo zapisać element bez kategorii.
- Elementy bez `category_id` są prezentowane w wirtualnej sekcji „Inne”; nie jest ona osobnym rekordem w bazie.
- Elementy są grupowane według kategorii, a wykonane pozycje są wyświetlane na końcu grupy.
- Sekcje można zwijać i zmieniać ich kolejność przez Drag & Drop. Oba ustawienia są stanem lokalnym bieżącego widoku i nie są synchronizowane.
- Użytkownik może oznaczyć element jako wykonany, przywrócić go, usunąć, usunąć wszystkie wykonane albo wyczyścić całą listę.
- Pojedynczy element można usunąć pełnym swipe'em w lewo lub w prawo. Niepełny albo anulowany gest przywraca element do pozycji początkowej bez mutacji.

### 6.4. Lista todo

- Lista todo jest płaską checklistą bez grup kategorii, wyboru kategorii, automatycznego dopasowania i Drag & Drop.
- Elementy todo obsługują ten sam gest swipe-to-delete co elementy listy zakupowej.
- Nowy element otrzymuje `category_id = null`; może zawierać opcjonalną ilość lub krótką informację pomocniczą w polu `quantity`.
- Niewykonane zadania są prezentowane przed wykonanymi.
- Oznaczanie, przywracanie, pojedyncze usuwanie i czyszczenie działa tak samo jak na liście zakupowej.

### 6.5. Kategorie

- Początkowy słownik jest seedowany w migracji na podstawie `categories_rows.csv`.
- Kategorie są wyświetlane alfabetycznie, niezależnie od kolejności rekordów z backendu.
- Wyszukiwarka filtruje po nazwie kategorii, jej frazach oraz nazwach przypisanych elementów.
- Kafelek kategorii pokazuje powiązane frazy lub elementy w formie badge'y.
- Użytkownik może utworzyć, zmienić nazwę i usunąć kategorię.
- Modal edycji umożliwia również dodawanie i usuwanie fraz z pola `keywords`.
- Kategorie i ich zmiany podlegają Optimistic UI, cache offline oraz Supabase Realtime.

### 6.6. Wykonane elementy i automatyczne czyszczenie

- Zaznaczenie elementu ustawia `is_done = true` i `done_at`; odznaczenie czyści `done_at`.
- Wykonany element znika z UI po pięciu minutach, nawet gdy aplikacja pozostaje otwarta.
- Funkcja PostgreSQL uruchamiana przez `pg_cron` co minutę usuwa z bazy elementy wykonane co najmniej pięć minut wcześniej.
- Usunięcie jest propagowane do aktywnych klientów przez Realtime.

### 6.7. Synchronizacja Realtime

- Aplikacja subskrybuje zdarzenia `INSERT`, `UPDATE` i `DELETE` dla `lists`, `categories` oraz `list_items`.
- Zmiany są nanoszone przyrostowo na lokalne kolekcje zamiast każdorazowego pobierania całego zestawu.
- Subskrypcje respektują polityki RLS.

## 7. Offline i PWA

- Manifest, ikony i Service Worker umożliwiają instalację aplikacji.
- Service Worker przechowuje powłokę aplikacji, statyczne zasoby Next.js i stronę awaryjną. Nawigacja używa strategii network-first z fallbackiem do cache, a zasoby statyczne cache-first.
- Parametry nawigacyjne są interpretowane po stronie klienta, dlatego zapisany dokument `/` może odtworzyć właściwy widok również po uruchomieniu bez sieci, o ile jego dane znajdują się już w IndexedDB.
- IndexedDB przechowuje osobno dla użytkownika kolekcje `lists`, `categories` i `list-items` oraz kolejkę outbox.
- Gdy sieć jest niedostępna albo żądanie kończy się błędem sieciowym, mutacja zachowuje efekt optymistyczny i trafia do outboxa.
- Kolejka obsługuje operacje `upsert`, `update` i `delete` na listach, kategoriach oraz elementach list.
- Zmiany są synchronizowane w kolejności ich utworzenia po starcie aplikacji, dodaniu wpisu do kolejki lub odzyskaniu połączenia. Nieudane operacje są zachowywane i ponawiane; późniejsze operacje dotyczące tego samego rekordu czekają na rozwiązanie wcześniejszego błędu.
- Globalny komunikat pokazuje tryb offline, synchronizację, liczbę oczekujących zmian lub błąd synchronizacji; przy pełnej synchronizacji pozostaje ukryty.
- Pierwsze logowanie i pierwsze pobranie danych wymagają połączenia. Praca bez sieci jest gwarantowana po wcześniejszym poprawnym uruchomieniu online i zapisaniu powłoki oraz danych w cache.

## 8. UX i system wizualny

- Jasny i ciemny motyw korzystają z tych samych semantycznych tokenów kolorystycznych zdefiniowanych w OKLCH.
- Paleta rozróżnia akcje główne, listy zakupowe, listy todo oraz stany: sukces, informacja, ostrzeżenie i błąd.
- Każdy kolor tła posiada właściwy token tekstu/ikony, zapewniający odpowiedni kontrast w obu motywach.
- Karty, sticky headers i dolna nawigacja tworzą spójny system powierzchni z subtelnymi obramowaniami, cieniami i efektem szkła.
- Interaktywne ikony posiadają etykiety dostępności, stany aktywne, focus i czytelny feedback operacji.
- Swipe-to-delete rozpoznaje dominującą oś ruchu, nie blokuje pionowego przewijania i nie jest jedyną metodą wykonania akcji; dostępny pozostaje przycisk obsługiwany dotykiem, myszą i klawiaturą.
- Gest kończy akcję po przekroczeniu bezpiecznego progu pozycyjnego albo po krótszym, zdecydowanym flicku; drobny pionowy jitter palca nie anuluje ruchu poziomego.
- Animacje swipe respektują `prefers-reduced-motion`, korzystają z transformacji kompozytora i nie powodują re-renderowania całej listy podczas ruchu wskaźnika.
- Elementy list są memoizowane, a kosztowne sortowanie, filtrowanie i grupowanie korzysta z `useMemo`; callbacki mutacji pozostają stabilne tam, gdzie ma to wpływ na renderowanie.

## 9. Kryteria akceptacji i testy

Automatyczne testy Playwright obejmują co najmniej:

- jednostkową weryfikację czystych modeli: katalogu i filtrowania kategorii, wyglądu kategorii, grupowania i kolejności elementów, postępu list oraz neutralnych zmian kolekcji;
- statyczną weryfikację granic modułów i dostępu do infrastruktury przez ESLint;
- blokadę anonimowego dostępu przez RLS i logowanie konta z allowlisty;
- relacyjny CRUD, integralność danych, triggery i niezmienność typu listy;
- logowanie, wylogowanie oraz zapamiętywanie języka;
- adresy widoków, bezpośrednie wejście do listy oraz nawigację Back i Forward między listą, wszystkimi listami i kategoriami;
- CRUD listy zakupowej i jej elementów;
- progowe usuwanie list i elementów swipe'em w obu kierunkach zdarzeniami myszy i dotyku, anulowanie niepełnego gestu oraz zachowanie alternatywnego przycisku usuwania;
- utworzenie płaskiej listy todo z elementami bez kategorii;
- pracę z kategoriami: tworzenie, zmiana nazwy, wyszukiwanie, edycja fraz i usuwanie;
- odbieranie zmian list i elementów przez Supabase Realtime;
- dodanie zmiany offline i automatyczną synchronizację po powrocie sieci;
- ponowne otwarcie zapisanej powłoki PWA bez połączenia.

Podstawowe polecenia weryfikacyjne:

- `npm run lint`
- `npm run test:unit`
- `npm run test:e2e`
- `npm run test:e2e:db`
- `npm run test:e2e:pwa`

## 10. Świadome ograniczenia

- Aplikacja jest przeznaczona dla dokładnie dwóch zaufanych użytkowników i nie implementuje osobnych przestrzeni roboczych ani zaproszeń.
- Dane aplikacyjne są współdzielone; `created_by` nie ogranicza widoczności rekordów.
- Typ istniejącej listy jest niezmienny.
- Kolejność i zwinięcie kategorii wewnątrz listy nie są synchronizowane między urządzeniami.
- Sekcja „Inne” jest wyłącznie reprezentacją elementów bez kategorii.
