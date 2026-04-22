import { open } from 'react-native-quick-sqlite';

// Otwarcie bazy danych
export const db = open({ name: 'shelfchef.db' });

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
  };