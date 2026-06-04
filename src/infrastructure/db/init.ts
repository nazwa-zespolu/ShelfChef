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

  runSchemaMigrations();

  MOCK_DATA_SQL.forEach(sql => {
    db.execute(sql);
  });
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

