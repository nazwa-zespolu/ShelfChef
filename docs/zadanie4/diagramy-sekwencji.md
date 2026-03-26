# Diagramy sekwencji

## UC-01: Dodanie produktu przez skanowanie kodu kreskowego

```mermaid
sequenceDiagram
    actor User as Użytkownik
    participant Scan as scanToAdd
    participant Scanner as scanningUtility
    participant OffService as OpenFoodFactsService
    participant DB as DatabaseService

    User->>Scan: Wybiera "Skanuj produkty"
    Scan->>Scanner: skanuj kod EAN
    Scanner-->>Scan: scannedEAN
    Scan->>DB: fetchProductByEAN(scannedEAN)
    DB-->>Scan: Produkt nie znaleziony
    Scan->>OffService: fetchProductByEAN(scannedEAN)

    
    alt Produkt znaleziony w OFF
        OffService-->>Scan: ProductDTO
        Scan-->>User: Wyświetla dane produktu
        User->>Scan: Ustawia datę ważności, kategorię, lokalizację i ilość
        User->>Scan: Klika "Zapisz"
        Scan->>DB: insertProduct(product)
        DB-->>Scan: UUID
        Scan-->>User: Produkt dodany
    else API niedostępne / brak wyniku
        OffService-->>Scan: błąd lub pusta odpowiedź
        Scan-->>User: Przejście do ręcznego dodawania (UC-02)
    end
```

## UC-02: Ręczne dodanie produktu

```mermaid
sequenceDiagram
    actor User as Użytkownik
    participant Manual as addProductManual
    participant DB as DatabaseService

    User->>Manual: Wybiera "Dodaj produkt ręcznie"
    User->>Manual: Podaje nazwę, kategorię, lokalizację, datę ważności i ilość
    User->>Manual: Klika "Zapisz"
    Manual->>DB: insertProduct(product)
    DB-->>Manual: UUID
    Manual-->>User: Produkt dodany
```

## UC-03: Zużycie / usunięcie produktu

```mermaid
sequenceDiagram
    actor User as Użytkownik
    participant Del as deleteProduct
    participant Scanner as scanningUtility
    participant DB as DatabaseService

    User->>Del: Wybiera "Usuń produkty"
    DB-->>Del: queryAllProducts()
    Del-->>User: Wyświetla listę produktów

    alt Wyszukanie przez skan EAN
        User->>Scanner: Skanuje kod EAN produktu
        Scanner-->>Del: EAN
    else Wybór z listy
        User->>Del: Wybiera produkt z listy
    end

    User->>Del: Wybiera zmniejszenie ilości lub usunięcie

    alt Zmniejszenie ilości
        Del->>DB: updateProduct(product)
        DB-->>Del: ok
        Del-->>User: Ilość zaktualizowana
    else Usunięcie produktu
        Del->>DB: deleteProduct(id)
        DB-->>Del: ok
        Del-->>User: Produkt usunięty
    end
```

## UC-04: Przegląd kończących się terminów

```mermaid
sequenceDiagram
    actor User as Użytkownik
    participant DB as DatabaseService

    User->>DB: queryAllProducts()
    DB-->>User: listaProduktów
    Note over User: System sortuje według daty ważności rosnąco
    User->>User: Wyświetla listę kończących się produktów
    User->>DB: queryProductById(id)
    DB-->>User: szczegółyProduktu
```

## UC-05: Propozycja przepisu AI

```mermaid
sequenceDiagram
    actor User as Użytkownik
    participant Recipe as generateRecipe
    participant DB as DatabaseService
    participant AI as AIRecipeService

    User->>Recipe: Wybiera "Propozycja przepisu AI"
    User->>Recipe: Wpisuje preferencje
    User->>Recipe: Klika "Generuj przepis"
    Recipe->>DB: queryAllProducts()
    DB-->>Recipe: dostępneProdukty
    Recipe->>AI: generateRecipe(dostępneProdukty, preference)

    alt AI API zwraca odpowiedź
        AI-->>Recipe: RecipeProposal
        Recipe-->>User: Wyświetla wygenerowany przepis
    else API niedostępne / brak internetu
        AI->>AI: handleAPIFailure()
        AI-->>Recipe: błąd
        Recipe-->>User: Wyświetla komunikat i opcję ponowienia
    end
```

## UC-06: Generowanie listy zakupów

```mermaid
sequenceDiagram
    actor User as Użytkownik
    participant List as shoppingList
    participant DB as DatabaseService

    User->>List: Wybiera "Stwórz listę zakupów"
    List->>DB: queryAllProducts()
    DB-->>List: aktualneZapasy
    Note over List: Wyznacza brakujące produkty na podstawie zapasów
    List-->>User: Wyświetla sugestie brakujących produktów
    User->>List: Potwierdza/odrzuca sugestie
    User->>List: Dodaje własne pozycje
    User->>List: insertProduct(product) dla każdej pozycji
    List-->>User: Lista zakupów gotowa

    opt Po zakupach
        User->>List: Oznacza kupione produkty
        loop Dla każdego kupionego produktu
            List->>DB: insertProduct(product)
            DB-->>List: UUID
        end
        User->>List: deleteProduct(id) dla zrealizowanych pozycji
        List-->>User: Produkty dodane do zapasów
    end
```
