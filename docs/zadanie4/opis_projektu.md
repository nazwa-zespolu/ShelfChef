# Opis projektu

## SOLID

- **S (Single Responsibility)**:
  - klasy `OpenFoodFactsService` i `AIRecipeService` mają jasną odpowiedzialność,
  - `DatabaseService` ma szeroki zakres (CRUD + backup).

- **O (Open/Closed)**:
  - można podmienić usługi zewnętrzne (`OpenFoodFactsService`, `AIRecipeService`),

- **L (Liskov Substitution)**:
  - model nie opiera się na dziedziczeniu, więc zasada nie jest tu kluczowym mechanizmem.

- **I (Interface Segregation)**:
  - klasy usługowe są dość wyspecjalizowane,

- **D (Dependency Inversion)**:
  - istnieje separacja usług zewnętrznych.

## Wzorce projektowe

### Repository Pattern
- `DatabaseService` - centralne repozytorium zarządzające dostępem do bazy SQLite.
- Abstrahuje szczegóły implementacji bazy danych.
- Udostępnia interfejs CRUD: `insertProduct()`, `deleteProduct()`, `updateProduct()`, `queryAllProducts()`, `queryProductById()`.
- Zarządza również backupami (`createBackup()`, `restoreFromBackup()`).

### Adapter / Wrapper Pattern
- `OpenFoodFactsService` - adaptuje zewnętrzne API OpenFoodFacts do wewnętrznego użytku.
- Konwertuje dane API do `ProductDTO`.
- Dostarcza obrazy produktów.
- `AIRecipeService` - adaptuje API AI do systemu.
- Generuje przepisy na podstawie dostępnych produktów.
- Zawiera walidację i obsługę błędów.

### Chain of Responsibility / Fallback Pattern
- `UC-01` (Dodanie przez skan):
  - Najpierw szuka w lokalnej bazie danych.
  - Jeśli nie znaleziono -> próbuje `OpenFoodFactsService`.
  - Jeśli API niedostępne -> przechodzi do `UC-02` (ręczne dodanie).

### Strategy Pattern
- Dwa sposoby dodania produktu:
  - Strategia skanowania (`UC-01`: `scanToAdd` + `scanningUtility`).
  - Strategia ręcznego wprowadzenia (`UC-02`: `addProductManual`).
- Obie strategie prowadzą do tego samego wyniku: `insertProduct()`.

