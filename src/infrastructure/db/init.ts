import { open } from 'react-native-quick-sqlite';

// Otwarcie bazy danych
export const db = open({ name: 'shelfchef.db' });
export function runInTransaction<T>(work: () => T): T {
  db.execute('BEGIN TRANSACTION');
  try {
    const result = work();
    db.execute('COMMIT');
    return result;
  } catch (e) {
    db.execute('ROLLBACK');
    throw e;
  }
}

function setupShoppingListsSchema() {
  db.execute(`
      CREATE TABLE IF NOT EXISTS product_catalog (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('generic', 'specific')),
        product_ean TEXT,
        image_url TEXT,
        parent_catalog_product_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(product_ean) REFERENCES product_definitions(ean),
        FOREIGN KEY(parent_catalog_product_id) REFERENCES product_catalog(id)
      );
    `);

  db.execute(`
      CREATE TABLE IF NOT EXISTS shopping_lists (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('manual', 'auto')),
        icon_key TEXT NOT NULL DEFAULT 'basket',
        icon_color_key TEXT NOT NULL DEFAULT 'green',
        is_locked INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        locked_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

  db.execute(`
      CREATE TABLE IF NOT EXISTS shopping_list_items (
        id TEXT PRIMARY KEY,
        list_id TEXT NOT NULL,
        catalog_product_id TEXT,
        label TEXT NOT NULL,
        icon_key TEXT NOT NULL DEFAULT 'box',
        icon_color_key TEXT NOT NULL DEFAULT 'green',
        quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0),
        sort_order INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL CHECK(status IN ('planned', 'purchased', 'stored')),
        source TEXT NOT NULL CHECK(source IN ('manual', 'suggestion', 'reactivated')),
        stored_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(list_id) REFERENCES shopping_lists(id),
        FOREIGN KEY(catalog_product_id) REFERENCES product_catalog(id)
      );
    `);

  db.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_product_catalog_ean
      ON product_catalog(product_ean)
      WHERE product_ean IS NOT NULL;
    `);

  db.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_product_catalog_generic_name
      ON product_catalog(kind, normalized_name)
      WHERE kind = 'generic';
    `);

  db.execute(`
      CREATE INDEX IF NOT EXISTS idx_shopping_list_items_list_status
      ON shopping_list_items(list_id, status);
    `);

  db.execute(`
      CREATE INDEX IF NOT EXISTS idx_shopping_list_items_list_order
      ON shopping_list_items(list_id, sort_order, created_at);
    `);

  db.execute(`
      CREATE INDEX IF NOT EXISTS idx_shopping_lists_type_locked
      ON shopping_lists(type, is_locked);
    `);

  createShoppingListItemCatalogProductsTable();

  db.execute(`
      INSERT OR IGNORE INTO product_catalog (
        id,
        name,
        normalized_name,
        kind,
        product_ean,
        image_url,
        parent_catalog_product_id,
        created_at,
        updated_at
      )
      SELECT
        'catalog-specific-' || ean,
        name,
        lower(trim(name)),
        'specific',
        ean,
        image_url,
        NULL,
        datetime('now'),
        datetime('now')
      FROM product_definitions;
    `);
}

function createShoppingListItemCatalogProductsTable() {
  db.execute(`
      CREATE TABLE IF NOT EXISTS shopping_list_item_catalog_products (
        item_id TEXT NOT NULL,
        catalog_product_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(item_id, catalog_product_id),
        FOREIGN KEY(item_id) REFERENCES shopping_list_items(id),
        FOREIGN KEY(catalog_product_id) REFERENCES product_catalog(id)
      );
    `);

  db.execute(`
      CREATE INDEX IF NOT EXISTS idx_shopping_item_catalog_products_catalog
      ON shopping_list_item_catalog_products(catalog_product_id);
    `);
}

// Development databases are reset manually when the schema changes.
export const setupDatabase = () => runInTransaction(() => {
  // 1. Tabela cache
  db.execute(`
      CREATE TABLE IF NOT EXISTS product_definitions (
        ean TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        brand TEXT,
        image_url TEXT,
        category TEXT,
        normalized_name TEXT,
        is_vegetarian INTEGER,
        is_vegan INTEGER,
        is_gluten_free INTEGER,
        is_lactose_free INTEGER
      );
    `);

  // 2. Tabela zapasow
  db.execute(`
      CREATE TABLE IF NOT EXISTS inventory (
        id TEXT PRIMARY KEY,
        product_ean TEXT,
        custom_name TEXT,
        expiry_date TEXT,
        opened_at TEXT,
        is_opened INTEGER DEFAULT 0,
        is_vegetarian INTEGER,
        is_vegan INTEGER,
        is_gluten_free INTEGER,
        is_lactose_free INTEGER,
        created_at TEXT NOT NULL,
        FOREIGN KEY(product_ean) REFERENCES product_definitions(ean)
      );
    `);
  db.execute(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

  setupShoppingListsSchema();
});
