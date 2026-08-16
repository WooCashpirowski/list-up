# AI INSTRUCTIONS: Shared Grocery & Todo PWA

## Tech Stack
- Next.js (App Router), React 18/19, TypeScript (Strict)
- Tailwind CSS (clsx, tailwind-merge)
- Supabase (PostgreSQL, Auth, Realtime)
- dnd-kit (do obsługi Drag'n'Drop)

## Kod i architektura (Domain-Driven Design)
- Kod podzielony na domeny w `/src/modules/` (np. `lists`, `categories`, `auth`).
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
- Tabele: `profiles` (id, email), `lists`, `categories`, `list_items` (zawiera flagę `is_done` i `done_at`).
- Row Level Security (RLS) pozwala na dostęp wyłącznie wskazanym adresom email.
- Auto-usuwanie: Elementy oznaczone jako wykonane znikają z UI po 5 minutach (obsłużone za pomocą lokalnego `setTimeout` oraz czyszczenia bazy w tle).
