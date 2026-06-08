import { open } from 'react-native-quick-sqlite';

// Otwarcie bazy danych
export const db = open({ name: 'shelfchef.db' });

const MOCK_DATA_SQL = [
  // 1. Product definitions (in English) - expanded base for the LLM
  `INSERT OR IGNORE INTO product_definitions (ean, name, brand, image_url, category) VALUES 
    ('5901234567890', 'Whole Milk UHT 3.2%', 'Mlekovita', 'https://images.openfoodfacts.org/images/products/590/780/928/4295/front_pl.4.full.jpg', 'Dairy'),
    ('5909876543210', 'Spaghetti Pasta', 'Barilla', 'https://images.unsplash.com/photo-1571212515416-fef01fc43637?auto=format&fit=crop&w=640&q=80', 'Dry Goods'),
    ('5904445556667', 'Dark Chocolate', 'Wedel', 'https://link-do-zdjecia.pl/czekolada.jpg', 'Sweets'),
    ('6901234567890', 'White Sugar', 'Royal Sugar', 'https://link-do-zdjecia.pl/cukier.jpg', 'Pantry'),
    ('5901112223334', 'Free-range Eggs', 'Free Hen', 'https://link-do-zdjecia.pl/jajka.jpg', 'Dairy'),
    ('5905556667778', 'Wheat Flour Type 500', 'Szczepanki Mill', 'https://link-do-zdjecia.pl/maka.jpg', 'Dry Goods'),
    ('5908889990001', 'Extra Butter 82%', 'Laciate', 'https://link-do-zdjecia.pl/maslo.jpg', 'Dairy'),
    ('5902223334445', 'Chopped Tomatoes (canned)', 'Pudliszki', 'https://link-do-zdjecia.pl/pomidory.jpg', 'Pantry'),
    ('5907778889992', 'Chicken Breast Fillet', 'Farm Fresh', 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=640&q=80', 'Meat'),
    ('5908887776661', 'Yellow Onion', 'Local Farm', 'https://images.unsplash.com/photo-1519864600265-abb23847ef2c?auto=format&fit=crop&w=640&q=80', 'Vegetables'),
    ('5903332221111', 'Carrots', 'Local Farm', 'https://images.unsplash.com/photo-1502741338009-cac2772e18bc?auto=format&fit=crop&w=640&q=80', 'Vegetables'),
    ('5902221110003', 'Olive Oil', 'Bertolli', 'https://images.unsplash.com/photo-1519864600265-abb23847ef2c?auto=format&fit=crop&w=640&q=80', 'Oils'),
    ('5909998887775', 'Cheddar Cheese', 'Cheese Co.', 'https://images.unsplash.com/photo-1523983303491-284aa6e53420?auto=format&fit=crop&w=640&q=80', 'Dairy');`,

  // 2. Inventory (sample items currently in the fridge/pantry, focused on dinner possibilities)
  // Expiry dates set to have a mix (some short, some long) - to stimulate "use soon" logic
  `INSERT OR IGNORE INTO inventory (id, product_ean, custom_name, expiry_date, is_opened) VALUES 
    ('mock-1', '5901234567890', NULL, '2026-05-20', 0), -- Milk
    ('mock-2', '5909876543210', NULL, '2027-12-01', 0), -- Spaghetti Pasta
    ('mock-3', '5904445556667', NULL, '2026-08-15', 0), -- Dark Chocolate
    ('mock-4', '6901234567890', NULL, '2028-01-01', 0), -- Sugar
    ('mock-5', '5901112223334', NULL, '2026-05-10', 0), -- Eggs (short expiry)
    ('mock-6', '5905556667778', NULL, '2027-01-10', 0), -- Flour
    ('mock-7', '5908889990001', NULL, '2026-05-12', 1), -- Butter (opened & short expiry)
    ('mock-8', '5902223334445', NULL, '2026-11-20', 0), -- Canned Tomatoes
    ('mock-9', '5907778889992', NULL, '2026-05-09', 1), -- Chicken Breast Fillet (opened, expiring soon)
    ('mock-10', '5908887776661', NULL, '2026-05-18', 0), -- Onion
    ('mock-11', '5903332221111', NULL, '2026-10-01', 0), -- Carrots
    ('mock-12', '5902221110003', NULL, '2028-01-01', 0), -- Olive Oil
    ('mock-13', '5909998887775', NULL, '2026-09-20', 0), -- Cheddar Cheese
    ('mock-14', NULL, 'Grandma''s homemade jam', '2026-12-31', 1);`
];

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

export const setupDatabase = () => {
  // 1. Tabela cache
  db.execute(`
      CREATE TABLE IF NOT EXISTS product_definitions (
        ean TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        brand TEXT,
        image_url TEXT,
        category TEXT
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
        FOREIGN KEY(product_ean) REFERENCES product_definitions(ean)
      );
    `);
  db.execute(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  MOCK_DATA_SQL.forEach(sql => {
    db.execute(sql);
  });
  runInTransaction(setupShoppingListsSchema);
};
