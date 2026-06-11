import { open } from 'react-native-quick-sqlite';

// Otwarcie bazy danych
export const db = open({ name: 'shelfchef.db' });
const SCHEMA_VERSION_KEY = 'schema_version';
const CURRENT_SCHEMA_VERSION = 3;
const DIETARY_COLUMNS = [
  'is_vegetarian',
  'is_vegan',
  'is_gluten_free',
  'is_lactose_free',
] as const;
const MOCK_DATA_SQL = [
  // 1. Product definitions (in English) - expanded base for the LLM
  `INSERT OR IGNORE INTO product_definitions (ean, name, brand, image_url, category) VALUES 
    ('5901234567890', 'Whole Milk UHT 3.2%', 'Mlekovita', 'https://images.openfoodfacts.org/images/products/590/780/928/4295/front_pl.4.full.jpg', 'Dairy'),
    ('8004690051573', 'Spaghetti Pasta', 'Barilla', 'https://images.openfoodfacts.org/images/products/800/469/005/1573/front_it.78.full.jpg', 'Dry Goods'),
    ('5901588018195', 'Dark Chocolate', 'Wedel', 'https://images.openfoodfacts.org/images/products/590/158/801/8195/front_pl.44.full.jpg', 'Sweets'),
    ('5907069000017', 'White Sugar', 'Royal Sugar', 'https://images.openfoodfacts.org/images/products/590/706/900/0017/front_pl.13.full.jpg', 'Pantry'),
    ('5906750296111', 'Free-range Eggs', 'Free Hen', 'https://images.openfoodfacts.org/images/products/590/675/029/6111/front_pl.4.full.jpg', 'Dairy'),
    ('5902020163213', 'Wheat Flour Type 500', 'Basia', 'https://images.openfoodfacts.org/images/products/590/202/016/3213/front_pl.4.full.jpg', 'Dry Goods'),
    ('5900512300108', 'Extra Butter 82%', 'Laciate', 'https://images.openfoodfacts.org/images/products/590/051/230/0108/front_pl.24.full.jpg', 'Dairy'),
    ('80042556', 'Chopped Tomatoes (canned)', 'Mutti', 'https://images.openfoodfacts.org/images/products/000/008/004/2556/front_pl.301.full.jpg', 'Pantry'),
    ('2837410005077', 'Chicken Breast Fillet', 'Farm Fresh', 'https://images.openfoodfacts.org/images/products/283/741/000/5077/front_pl.5.full.jpg', 'Meat'),
    ('5908887776661', 'Yellow Onion', 'Local Farm', 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS3_Eqyeh5ZSOzqs_zHEDyQLeOtbrjJQ-R8Vg&s', 'Vegetables'),
    ('5903332221111', 'Carrots', 'Local Farm', 'https://irme.pl/wp-content/uploads/2020/11/ZD-3-20-1024x768.jpg', 'Vegetables'),
    ('80053828', 'Olive Oil', 'Bertolli', 'https://images.openfoodfacts.org/images/products/000/008/005/3828/front_pl.4.full.jpg', 'Oils'),
    ('5908250801284', 'Cheddar Cheese', 'Cheese Co.', 'https://images.openfoodfacts.org/images/products/590/825/080/1284/front_pl.16.full.jpg', 'Dairy');`,

  // 2. Inventory (sample items currently in the fridge/pantry, focused on dinner possibilities)
  // Expiry dates set to have a mix (some short, some long) - to stimulate "use soon" logic
  `INSERT OR IGNORE INTO inventory (id, product_ean, custom_name, expiry_date, opened_at, is_opened, created_at) VALUES
    ('mock-1', '5901234567890', NULL, '2026-05-20', NULL, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-13 days')), -- Milk
    ('mock-2', '8004690051573', NULL, '2027-12-01', NULL, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-12 days')), -- Spaghetti Pasta
    ('mock-3', '5901588018195', NULL, '2026-08-15', NULL, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-11 days')), -- Dark Chocolate
    ('mock-4', '5907069000017', NULL, '2028-01-01', NULL, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-10 days')), -- Sugar
    ('mock-5', '5906750296111', NULL, '2026-05-10', NULL, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-9 days')), -- Eggs (short expiry)
    ('mock-6', '5902020163213', NULL, '2027-01-10', NULL, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-8 days')), -- Flour
    ('mock-7', '5900512300108', NULL, '2026-05-12', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-18 hours'), 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')), -- Butter (opened & short expiry)
    ('mock-8', '80042556', NULL, '2026-11-20', NULL, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-6 days')), -- Canned Tomatoes
    ('mock-9', '2837410005077', NULL, '2026-05-09', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 hours'), 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-5 days')), -- Chicken Breast Fillet (opened, expiring soon)
    ('mock-10', '5908887776661', NULL, '2026-05-18', NULL, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-4 days')), -- Onion
    ('mock-11', '5903332221111', NULL, '2026-10-01', NULL, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 days')), -- Carrots
    ('mock-12', '80053828', NULL, '2028-01-01', NULL, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days')), -- Olive Oil
    ('mock-13', '5908250801284', NULL, '2026-09-20', NULL, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day')), -- Cheddar Cheese
    ('mock-14', NULL, 'Grandma''s homemade jam', '2026-12-31', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days'), 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));`
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
        image_url TEXT,
        parent_catalog_product_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(product_ean) REFERENCES product_definitions(ean),
        FOREIGN KEY(parent_catalog_product_id) REFERENCES product_catalog(id)
      );
    `);
  ensureProductCatalogImageUrlColumn();

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

function ensureProductCatalogImageUrlColumn() {
  if (!hasProductCatalogColumn('image_url')) {
    db.execute('ALTER TABLE product_catalog ADD COLUMN image_url TEXT');
  }
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

  runSchemaMigrations();

  MOCK_DATA_SQL.forEach(sql => {
    db.execute(sql);
  });
  runInTransaction(setupShoppingListsSchema);
};

const runSchemaMigrations = () => {
  const currentVersion = getStoredSchemaVersion();

  if (currentVersion < 2 || !hasProductDefinitionsColumn('normalized_name')) {
    db.execute(
      'ALTER TABLE product_definitions ADD COLUMN normalized_name TEXT',
    );
  }

  if (currentVersion < 3) {
    for (const column of DIETARY_COLUMNS) {
      if (!hasProductDefinitionsColumn(column)) {
        db.execute(
          `ALTER TABLE product_definitions ADD COLUMN ${column} INTEGER`,
        );
      }
      if (!hasInventoryColumn(column)) {
        db.execute(`ALTER TABLE inventory ADD COLUMN ${column} INTEGER`);
      }
    }
  }

  setStoredSchemaVersion(CURRENT_SCHEMA_VERSION);
};

const getStoredSchemaVersion = (): number => {
  const result = db.execute(
    'SELECT value FROM app_settings WHERE key = ?',
    [SCHEMA_VERSION_KEY],
  );

  if (!result.rows || result.rows.length === 0) {
    return 0;
  }

  const row = result.rows.item(0);
  const parsed = Number.parseInt(String(row.value), 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const setStoredSchemaVersion = (version: number) => {
  db.execute(
    'INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)',
    [SCHEMA_VERSION_KEY, String(version)],
  );
};

const hasProductDefinitionsColumn = (columnName: string): boolean => {
  const result = db.execute('PRAGMA table_info(product_definitions)');

  if (!result.rows) {
    return false;
  }

  for (let i = 0; i < result.rows.length; i++) {
    const row = result.rows.item(i);
    if (String(row.name) === columnName) {
      return true;
    }
  }

  return false;
};

const hasInventoryColumn = (columnName: string): boolean => {
  const result = db.execute('PRAGMA table_info(inventory)');

  if (!result.rows) {
    return false;
  }

  for (let i = 0; i < result.rows.length; i++) {
    const row = result.rows.item(i);
    if (String(row.name) === columnName) {
      return true;
    }
  }

  return false;
};

const hasProductCatalogColumn = (columnName: string): boolean => {
  const result = db.execute('PRAGMA table_info(product_catalog)');

  if (!result.rows) {
    return false;
  }

  for (let i = 0; i < result.rows.length; i++) {
    const row = result.rows.item(i);
    if (String(row.name) === columnName) {
      return true;
    }
  }

  return false;
};
