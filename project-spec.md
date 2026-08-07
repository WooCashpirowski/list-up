# Specyfikacja Aplikacji: Shared Grocery & Todo PWA

## Cel
Aplikacja PWA offline-ready / real-time do zarządzania listami zakupów i zadaniami. 

## Stack Technologiczny
- Next.js (App Router)
- React 18/19
- Tailwind CSS
- Supabase (PostgreSQL, Auth, Realtime)
- dnd-kit (lub podobna lekka biblioteka do Drag'n'Drop)

## Model Danych (Supabase)
Wymagane tabele:
1. `profiles`: (id, email) - powiązane z Supabase Auth. RLS dopuszcza tylko dwa konkretne maile.
2. `lists`: (id, title, created_at, updated_at)
3. `categories`: (id, name, order_index)
4. `list_items`: (id, list_id, category_id, name, quantity, is_done, done_at)

## Funkcjonalności & Logika Biznesowa

### 1. Autoryzacja
- Magiczne linki lub hasło przez Supabase Auth.
- Strict Row Level Security (RLS) - tylko autoryzowane emaile mogą odczytywać i mutować jakiekolwiek dane.

### 2. Widok Główny (Moje Listy)
- Pobieranie list z Supabase (sortowanie po `updated_at` malejąco).
- CRUD na kartach list (tworzenie, edycja tytułu, usuwanie).

### 3. Widok Listy (Krytyczny pod kątem UX)
- **Kategorie:** Zwijane/rozwijane (stan UI only).
- **Elementy:** Dodawanie za pomocą formularza (Optimistic UI - element natychmiast ląduje na liście). Jeśli element nie znajduje się w żadnej kategorii, triggerujemy modal umożliwiający dodanie nowego elementu do kategorii -> dodanie zapisuje w bazie; jeśli element nie zostanie dodany -? zapisujemy w domyślnej kategorii Inne (nie synchronizuje się z bazą)
- **Drag & Drop:** Użytkownik może ręcznie sortować kolejność kategorii w ramach listy (stan UI tylko lokalny na czas zakupów, nie musi być synchronizowany z DB, lub zapisywany z debouncem).
- **Oznaczanie jako wykonane:** Kliknięcie w element aktualizuje `is_done` oraz timestamp `done_at`.
- **Auto-usuwanie:** Elementy z `is_done = true` znikają z UI po 5 minutach. Zaimplementuj to używając lokalnego timera (`setTimeout`) w połączeniu z Supabase Edge Function / pg_cron, który faktycznie czyści bazę co kilka minut, aby oba urządzenia widziały usunięcie niezależnie.
- **Wyczyść listę:** Usuwa wszystkie (lub tylko odhaczone) elementy z danej listy.
- **Synchronizacja Realtime:** Supabase subscriptions nasłuchują na zmiany w `list_items` i `lists`.

### 4. Zarządzanie Kategoriami
- Lista kategorii wstępnie zapełniona znajduje się w pliku `categories_rows.csv` - jest to export z bazy innego projektu, wykorzystajmy to
- Słownik kategorii dostępny z menu.
- Filtrowanie po nazwie kategorii lub elementach powiązanych.
- Badge na kafelku reprezentujące przedmioty przypisane z bazy do tej kategorii.
- Edycja (Modal) - modyfikacja nazwy kategorii.
- Sortowanie wymuszone: alfabetycznie (A-Z).