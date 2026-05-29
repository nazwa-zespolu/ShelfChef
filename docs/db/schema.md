# Schemat bazy danych


```mermaid
erDiagram
    PRODUCT_DEFINITIONS {
        TEXT ean PK
        TEXT name
        TEXT brand
        TEXT image_url
        TEXT category
    }

    INVENTORY {
        TEXT id PK
        TEXT product_ean FK
        TEXT custom_name
        TEXT expiry_date
        TEXT opened_at
        INTEGER is_opened
    }

    APP_SETTINGS {
        TEXT key PK
        TEXT value
    }

    PRODUCT_CATALOG {
        TEXT id PK
        TEXT name
        TEXT normalized_name
        TEXT kind
        TEXT product_ean FK
        TEXT parent_catalog_product_id FK
        TEXT created_at
        TEXT updated_at
    }

    SHOPPING_LISTS {
        TEXT id PK
        TEXT name
        TEXT type
        INTEGER is_locked
        INTEGER is_archived
        INTEGER sort_order
        TEXT locked_at
        TEXT created_at
        TEXT updated_at
    }

    SHOPPING_LIST_ITEMS {
        TEXT id PK
        TEXT list_id FK
        TEXT catalog_product_id FK
        TEXT label
        INTEGER quantity
        TEXT status
        TEXT source
        TEXT stored_at
        TEXT created_at
        TEXT updated_at
    }

    PRODUCT_DEFINITIONS ||--o{ INVENTORY : "defines scanned product"
    PRODUCT_DEFINITIONS ||--o| PRODUCT_CATALOG : "backs specific catalog product"

    PRODUCT_CATALOG ||--o{ SHOPPING_LIST_ITEMS : "used by"
    PRODUCT_CATALOG ||--o{ PRODUCT_CATALOG : "generic parent of specific"

    SHOPPING_LISTS ||--o{ SHOPPING_LIST_ITEMS : "contains"
```

## Najwazniejsze relacje

- `inventory.product_ean` wskazuje na `product_definitions.ean`, jesli produkt pochodzi ze skanu.
- `product_catalog.product_ean` wskazuje na `product_definitions.ean` dla produktow konkretnych (`specific`).
- `product_catalog.parent_catalog_product_id` laczy produkt konkretny z produktem ogolnym (`generic`).
- `shopping_list_items.list_id` wskazuje liste zakupow.
- `shopping_list_items.catalog_product_id` jest opcjonalne, bo zwykle pozycje tekstowe nie musza miec wpisu w katalogu.
- `shopping_lists.sort_order` zapisuje reczna kolejnosc list na ekranie list zakupow.
- `app_settings` jest tabela konfiguracyjna i nie ma relacji z pozostalymi tabelami.

## Indeksy

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_catalog_ean
ON product_catalog(product_ean)
WHERE product_ean IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_catalog_generic_name
ON product_catalog(kind, normalized_name)
WHERE kind = 'generic';

CREATE INDEX IF NOT EXISTS idx_shopping_list_items_list_status
ON shopping_list_items(list_id, status);

CREATE INDEX IF NOT EXISTS idx_shopping_lists_type_locked
ON shopping_lists(type, is_locked);
```
