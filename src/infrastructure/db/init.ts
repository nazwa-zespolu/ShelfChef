import { open } from 'react-native-quick-sqlite';

// Otwarcie bazy danych
export const db = open({ name: 'shelfchef.db' });
const MOCK_DATA_SQL = [
  // 1. Definicje produktów (nasz Cache)
  `INSERT OR IGNORE INTO product_definitions (ean, name, brand, image_url, category) VALUES 
    ('5901234567890', 'Mleko UHT 3.2%', 'Mlekovita', 'https://images.openfoodfacts.org/images/products/590/780/928/4295/front_pl.4.full.jpg', 'Nabiał'),
    ('5909876543210', 'Makaron Spaghetti', 'Barilla', 'https://images.unsplash.com/photo-1571212515416-fef01fc43637?auto=format&fit=crop&w=640&q=80', 'Produkty suche'),
    ('5904445556667', 'Czekolada Gorzka', 'Wedel', 'https://link-do-zdjecia.pl/czekolada.jpg', 'Słodycze');`,

  // 2. Konkretne przedmioty w Twojej lodówce (Inventory)
  // Używamy prostych ID tekstowych dla mocków
  `INSERT OR IGNORE INTO inventory (id, product_ean, custom_name, expiry_date, is_opened) VALUES 
    ('mock-1', '5901234567890', NULL, '2026-05-20', 0),
    ('mock-2', '5901234567890', NULL, '2026-06-15', 0),
    ('mock-3', '5909876543210', NULL, '2027-12-01', 0),
    ('mock-4', NULL, 'Domowa konfitura babci', '2026-12-31', 1);`
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
        expiry_date TEXT NOT NULL,
        opened_at TEXT,
        is_opened INTEGER DEFAULT 0,
        FOREIGN KEY(product_ean) REFERENCES product_definitions(ean)
      );
    `);
    MOCK_DATA_SQL.forEach(sql => {
      db.execute(sql);
    });

    
  };

