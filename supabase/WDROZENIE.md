# Magazyn PRO — wdrożenie poprawek Supabase

Pakiet został przygotowany do ręcznego wdrożenia. Żaden plik z tego katalogu
nie wykonuje się automatycznie i nic nie zostało wysłane do Supabase.

## Kolejność

1. W Supabase SQL Editor uruchom zawartość `00_preflight_readonly.sql`.
   Wszystkie wartości `issue_count` muszą wynosić `0`.
2. Jeżeli preflight jest czysty, uruchom w całości:
   `migrations/20260729190000_backend_hardening.sql`.
   Plik działa w jednej transakcji. Błąd przed `commit` wycofa całą migrację.
   Jeżeli główna migracja została wdrożona przed poprawką obsługi profilu
   tworzonego przez trigger Auth, uruchom następnie jednorazowo
   `migrations/20260729194800_fix_provision_profile_upsert.sql`.
3. W Supabase Dashboard otwórz Edge Function `create-company-worker`, zastąp
   jej kod zawartością `functions/create-company-worker/index.ts` i wybierz
   `Deploy updates`.
4. Upewnij się, że w konfiguracji funkcji weryfikacja JWT jest włączona.
   Odpowiada temu wpis z `config.toml`:

   ```toml
   [functions.create-company-worker]
   verify_jwt = true
   ```

5. Uruchom w SQL Editor zawartość `99_verify_readonly.sql`.
   Każdy wiersz powinien mieć `ok = true`.
6. Odśwież aplikację przez `Ctrl+F5` i zaloguj się ponownie.

## Co zmienia migracja

- przenosi helpery RLS do niewystawionego schematu `private`,
- wymaga aktywnego profilu, membershipu i firmy dla każdego dostępu,
- odbiera przeglądarce bezpośrednie zapisy do katalogów i ustawień firmy,
- udostępnia w ich miejsce walidowane RPC,
- blokuje samodzielną reaktywację profilu,
- serializuje operacje magazynowe firmy blokadą transakcyjną,
- odrzuca dodatkowe ręczne alokacje spoza BOM,
- zapisuje dokładne partie zużyte przez każdą pozycję produkcji,
- dodaje limity, całkowite ilości, unikalność bez rozróżniania wielkości
  liter i indeksy dla RLS, historii oraz FIFO,
- ogranicza funkcję provisionującą użytkownika wyłącznie do `service_role`.

## Kontrola funkcjonalna po wdrożeniu

Wykonaj na danych testowych:

1. Owner: logowanie, zmiana progów firmy i utworzenie worker/admin.
2. Części: utworzenie, edycja, archiwizacja i przywrócenie.
3. Dostawcy: utworzenie, cennik, archiwizacja i przywrócenie.
4. Maszyny: utworzenie z BOM, edycja, archiwizacja i przywrócenie.
5. Dostawa: poprawna dostawa oraz próba części nieprzypisanej do dostawcy.
6. Produkcja: FIFO i ręczna alokacja; stan oraz historia muszą się zgadzać.
7. Korekta: zwiększenie i zmniejszenie stanu oraz zapis historii.
8. Dostęp: dezaktywuj konto testowe i sprawdź, że jego istniejąca sesja nie
   odczytuje danych ani nie wykonuje RPC po ponowieniu żądania.
9. Rola bez uprawnienia: próba zapisu musi zakończyć się odmową.

## Ważne

- Nie wklejaj do kodu wartości `SUPABASE_SERVICE_ROLE_KEY`.
- Edge Function pobiera sekrety wyłącznie przez `Deno.env.get`.
- Jeżeli preflight pokaże wartości inne niż zero, nie uruchamiaj migracji.
  Wynik wskaże dokładny rodzaj testowych danych wymagających uporządkowania.
- Edytor Edge Functions w Dashboard nie zapewnia wygodnej historii zmian,
  dlatego zachowaj lokalny plik `index.ts` jako wersję źródłową.
