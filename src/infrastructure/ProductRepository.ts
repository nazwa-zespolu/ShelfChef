import { db } from './db/init';
import { ProductDefinition, InventoryItem } from '../domain/types';

export class ProductRepository {

  async findDefinitionByEan(ean: string): Promise<ProductDefinition | null> {
    const result = db.execute('SELECT * FROM product_definitions WHERE ean = ?', [ean]);
    if (result.rows && result.rows.length > 0) {
      const row = result.rows.item(0);
      return {
        ean: row.ean,
        name: row.name,
        brand: row.brand,
        imageUrl: row.image_url,
        category: row.category
      };
    }
    return null;
  }

  async saveDefinition(def: ProductDefinition): Promise<void> {
    db.execute(
      'INSERT OR REPLACE INTO product_definitions (ean, name, brand, image_url, category) VALUES (?, ?, ?, ?, ?)',
      [def.ean, def.name, def.brand, def.imageUrl, def.category]
    );
  }

  async addToInventory(id: string, ean: string | null, customName: string | null, expiryDate: string): Promise<void> {
    db.execute(
      'INSERT INTO inventory (id, product_ean, custom_name, expiry_date) VALUES (?, ?, ?, ?)',
      [id, ean, customName, expiryDate]
    );
  }

  async getFullInventory(): Promise<InventoryItem[]> {
    const query = `
      SELECT 
        i.id, i.expiry_date, i.opened_at, i.is_opened, i.custom_name,
        d.ean, d.name, d.brand, d.image_url, d.category
      FROM inventory i
      LEFT JOIN product_definitions d ON i.product_ean = d.ean
      ORDER BY i.expiry_date ASC
    `;

    const result = db.execute(query);
    const items: InventoryItem[] = [];

    if (result.rows) {
      for (let i = 0; i < result.rows.length; i++) {
        const row = result.rows.item(i);
        items.push({
          id: row.id,
          ean: row.ean || '',
          name: row.name || row.custom_name, // Fallback do nazwy własnej
          brand: row.brand,
          imageUrl: row.image_url,
          category: row.category,
          expiryDate: row.expiry_date,
          openedAt: row.opened_at,
          isOpened: row.is_opened === 1
        });
      }
    }
    return items;
  }

  async markAsOpened(id: string, date: string): Promise<void> {
    db.execute('UPDATE inventory SET is_opened = 1, opened_at = ? WHERE id = ?', [date, id]);
  }

  async removeFromInventory(id: string): Promise<void> {
    db.execute('DELETE FROM inventory WHERE id = ?', [id]);
  }
}