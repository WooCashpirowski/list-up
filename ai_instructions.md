# AI INSTRUCTIONS: Shared Grocery & Todo PWA

## Tech Stack
- Next.js (App Router), React 18/19, TypeScript (Strict)
- Tailwind CSS (clsx, tailwind-merge)
- Supabase (PostgreSQL, Auth, Realtime)
- dnd-kit (do obsługi Drag'n'Drop)

## Kod i architektura (Domain-Driven Design)
- Kod podzielony na domeny w `/src/modules/` (m.in. `lists`, `categories`, `auth`, `chat`, `notifications` i serwerowe `notification-dispatch`).
- Domena może zawierać: `components`, `hooks`, `model`, `gateways`, `services` i `types`.
- `model` zawiera czyste transformacje i logikę domenową, hooki zarządzają stanem oraz orkiestracją, `gateways` definiują porty domeny, a `services` implementują adaptery infrastruktury (np. Supabase).
- Kod spoza domeny importuje wyłącznie z jej publicznego `src/modules/<moduł>/index.ts`; importy wewnętrznych ścieżek innych modułów są zabronione.
- `src/lib` nie zależy od modułów domenowych. Bezpośrednie importy Supabase są dozwolone wyłącznie w `services`; komponenty, hooki, modele, typy i porty korzystają z gatewayów.
- Reguły granic są egzekwowane przez ESLint i nie należy ich wyłączać lokalnymi komentarzami.
- Tailwind CSS: grupuj klasy logicznie, używaj `clsx` i `tailwind-merge` do dynamicznych klas.
- Komponenty funkcjonalne, pisane w sposób modularny i DRY.
- Logika biznesowa musi być wyizolowana w czystych modelach i Custom Hooks (oddzielenie UI od logiki).

## Wytyczne dotyczące wydajności (Runtime Performance)
- Minimalizacja re-renderów jest kluczowa. Elementy list (szczególnie przy drag'n'drop) muszą wykorzystywać `React.memo`, `useMemo` i `useCallback`.
- Oddziel stan lokalny (dla płynności drag'n'drop, wyszukiwania kategorii) od stanu synchronizowanego przez Supabase Realtime.
- Mutacje (dodawanie, oznaczanie jako wykonane, usuwanie) muszą używać wzorca Optimistic UI – interfejs reaguje natychmiast, synchronizacja z bazą zachodzi w tle.

## Baza Danych i Logika (Supabase)
- Tabele aplikacyjne: `profiles` (z `display_name`), `lists`, `categories`, `list_items`, `chat_messages`, `chat_read_state` i `push_subscriptions`.
- Tabele serwerowe `notification_events` oraz `notification_deliveries` tworzą trwały, rozszerzalny outbox Web Push; klient nie ma do nich dostępu.
- Row Level Security (RLS) pozwala na dostęp wyłącznie wskazanym adresom email.
- Auto-usuwanie: Elementy oznaczone jako wykonane znikają z UI po 5 minutach (obsłużone za pomocą lokalnego `setTimeout` oraz czyszczenia bazy w tle).
- Wiadomości czatu są niemutowalne, stronicowane kursorem `sequence`, synchronizowane przez Realtime i kolejkę offline. `chat_read_state` utrzymuje monotoniczne kursory `last_delivered_sequence` i `last_read_sequence`; odczyt zawsze implikuje dostarczenie. Powiadomienia są wysyłane poza transakcją zapisu wiadomości.
- Czat jest dostępny pod `/?view=chat`; cache zachowuje maksymalnie 100 najnowszych wiadomości, a wskaźnik nieprzeczytanych znika dopiero po zobaczeniu najnowszej odebranej wiadomości w widocznym czacie.
- Efemeryczne potwierdzenia i stan pisania korzystają z autoryzowanego prywatnego kanału Realtime Broadcast `list-up:chat:live`. Stan pisania nie jest zapisywany w bazie, jest ograniczany częstotliwościowo i musi automatycznie wygasać po bezczynności lub rozłączeniu.
- Dispatcher Web Push działa wyłącznie po stronie serwera z service-role, prywatnym VAPID i sekretem webhooka. Żaden z tych sekretów nie może być eksportowany z publicznego API domeny klienckiej ani używany w zmiennej `NEXT_PUBLIC_*`.
