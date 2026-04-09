# Strategia realizacji Zadania 5 (testy jednostkowe, TDD RED)

## Co wynika z instrukcji

Z instrukcji do Zadania 5 wynika, ze trzeba dostarczyc:

1. wybor i uzasadnienie narzedzi testowych,
2. failujace testy jednostkowe (faza RED),
3. screenshot failujacych testow w `docs/zadanie5/`,
4. przygotowane zadania na pierwszy sprint w GitHub Projects.

Testy maja byc kodem w katalogu `tests/`, a dokumentacja/screenshoty w `docs/zadanie5/`.

## Rekomendowana strategia dla Waszego projektu

### 1. Ustalcie stack i uzasadnienie (krotko, konkretnie)

Proponowany stack:

- `Jest` - runner i assertions,
- `ts-jest` - uruchamianie testow TypeScript,
- `@types/jest` - typy.

Uzasadnienie:

- zgodnosc z planowanym React/TypeScript,
- niski koszt wejscia i dobra dokumentacja,
- latwe mockowanie repozytoriow i klientow API.

### 2. Zmapujcie testy na wymagania (traceability)

Dla kazdego kluczowego wymagania funkcjonalnego zrobcie co najmniej 1-2 testy jednostkowe
na poziomie logiki domenowej i use case'ow.

Przyklad mapowania:

- FR-01/FR-02 -> `AddProductByScanUseCase`, fallback na reczne dodanie,
- FR-08 -> `GetExpiringProductsUseCase` + `DefaultExpiryPolicy`,
- FR-09 -> `GenerateRecipeUseCase` (przekazanie danych do klienta AI).

### 3. Priorytet kolejnosci pisania testow

Kolejnosc zalecana:

1. testy czystej logiki (policy, walidatory),
2. testy use case'ow z mockami zaleznosci,
3. dopiero potem cienkie testy UI.

Dlaczego:

- szybciej sie uruchamiaja,
- sa bardziej stabilne,
- najmocniej zabezpieczaja logike biznesowa.

### 4. Celowo utrzymajcie RED

W Zadaniu 5 nie implementujcie kodu produkcyjnego "zeby test przeszedl".
Testy maja failowac i to trzeba udokumentowac screenshotem.

### 5. Przygotujcie wejscie do pierwszego sprintu

Na tablicy GitHub Projects zalozcie karty na implementacje pod testy:

- "Implementacja DefaultExpiryPolicy",
- "Implementacja GetExpiringProductsUseCase",
- "Implementacja AddProductByScanUseCase + fallback",
- "Implementacja GenerateRecipeUseCase",
- "Refactor + porzadki po GREEN".

Kazda karta: opis, zakres, osoba odpowiedzialna, kryterium done.

## Definicja gotowosci (Definition of Done) dla Zadania 5

Zadanie uznajcie za gotowe, gdy:

- w `tests/` sa failujace testy jednostkowe,
- w `docs/zadanie5/` jest screenshot z uruchomienia testow (RED),
- jest opis wyboru narzedzi i uzasadnienie,
- GitHub Projects zawiera rozpisane taski na pierwszy sprint.

## Minimalna checklista oddania

- [ ] `tests/` - zestaw failujacych testow
- [ ] `docs/zadanie5/` - screenshot RED (`.png`/`.jpg`)
- [ ] `docs/zadanie5/` - opis strategii i wyboru narzedzi
- [ ] GitHub Projects - karty sprintowe z przypisaniami
