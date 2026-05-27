import { open } from 'react-native-quick-sqlite';

// Otwarcie bazy danych
export const db = open({ name: 'shelfchef.db' });
const SHOPPING_LISTS_SCHEMA_VERSION = 2;

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

function getUserVersion(): number {
  const result = db.execute('PRAGMA user_version');
  if (!result.rows || result.rows.length === 0) {
    return 0;
  }
  const row = result.rows.item(0);
  return Number(row.user_version ?? 0);
}

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

function migrateToShoppingListsSchema() {
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
        is_locked INTEGER NOT NULL DEFAULT 0,
        is_archived INTEGER NOT NULL DEFAULT 0,
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
        quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0),
        status TEXT NOT NULL CHECK(status IN ('planned', 'purchased', 'unavailable', 'stored')),
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
      CREATE INDEX IF NOT EXISTS idx_shopping_lists_type_locked
      ON shopping_lists(type, is_locked);
    `);

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

  db.execute(`
      INSERT OR IGNORE INTO shopping_lists (
        id,
        name,
        type,
        is_locked,
        is_archived,
        locked_at,
        created_at,
        updated_at
      )
      VALUES (
        'default-auto-minimum',
        'Moje minimum',
        'auto',
        0,
        0,
        NULL,
        datetime('now'),
        datetime('now')
      );
    `);
}

function migrateCatalogConcreteToSpecific() {
  db.execute(`
      CREATE TABLE product_catalog_v2 (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('generic', 'specific')),
        product_ean TEXT,
        parent_catalog_product_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(product_ean) REFERENCES product_definitions(ean),
        FOREIGN KEY(parent_catalog_product_id) REFERENCES product_catalog_v2(id)
      );
    `);

  db.execute(`
      INSERT INTO product_catalog_v2 (
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
        CASE
          WHEN id LIKE 'catalog-concrete-%'
            THEN 'catalog-specific-' || substr(id, length('catalog-concrete-') + 1)
          ELSE id
        END,
        name,
        normalized_name,
        CASE WHEN kind = 'concrete' THEN 'specific' ELSE kind END,
        product_ean,
        CASE
          WHEN parent_catalog_product_id LIKE 'catalog-concrete-%'
            THEN 'catalog-specific-' || substr(parent_catalog_product_id, length('catalog-concrete-') + 1)
          ELSE parent_catalog_product_id
        END,
        created_at,
        updated_at
      FROM product_catalog;
    `);

  db.execute(`
      UPDATE shopping_list_items
      SET catalog_product_id = 'catalog-specific-' || substr(catalog_product_id, length('catalog-concrete-') + 1)
      WHERE catalog_product_id LIKE 'catalog-concrete-%';
    `);

  db.execute('DROP TABLE product_catalog');
  db.execute('ALTER TABLE product_catalog_v2 RENAME TO product_catalog');

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
}

function runMigrations() {
  const currentVersion = getUserVersion();
  if (currentVersion >= SHOPPING_LISTS_SCHEMA_VERSION) {
    return;
  }

  runInTransaction(() => {
    if (currentVersion < 1) {
      migrateToShoppingListsSchema();
    }
    if (currentVersion >= 1 && currentVersion < 2) {
      migrateCatalogConcreteToSpecific();
    }
    db.execute(`PRAGMA user_version = ${SHOPPING_LISTS_SCHEMA_VERSION}`);
  });
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
  runMigrations();
};
