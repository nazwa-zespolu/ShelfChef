import { db } from './db/init';
import { ProductDefinition, InventoryItem } from '../domain/types';

export interface PendingNormalizationRecord {
  ean: string;
  name: string;
}

export interface NormalizationUpdateRecord {
  ean: string;
  normalizedName: string;
}

export class ProductRepository {
  private static readonly RECIPE_MODEL_CONSENT_KEY = 'recipe_model_download_consent';

  async findDefinitionByEan(ean: string): Promise<ProductDefinition | null> {
    const result = db.execute('SELECT * FROM product_definitions WHERE ean = ?', [ean]);
    if (result.rows && result.rows.length > 0) {
      const row = result.rows.item(0);
      return {
        ean: row.ean,
        name: row.name,
        brand: row.brand,
        imageUrl: row.image_url,
        category: row.category,
        ...(row.normalized_name != null ? { normalizedName: row.normalized_name } : {}),
      };
    }
    return null;
  }

  async saveDefinition(def: ProductDefinition): Promise<void> {
    db.execute(
      `INSERT INTO product_definitions (ean, name, brand, image_url, category, normalized_name)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(ean) DO UPDATE SET
         name = excluded.name,
         brand = excluded.brand,
         image_url = excluded.image_url,
         category = excluded.category,
         normalized_name = COALESCE(excluded.normalized_name, product_definitions.normalized_name)`,
      [def.ean, def.name, def.brand, def.imageUrl, def.category, def.normalizedName ?? null]
    );
  }

  async addToInventory(
    id: string,
    ean: string | null,
    customName: string | null,
    expiryDate: string | null,
  ): Promise<void> {
    db.execute(
      'INSERT INTO inventory (id, product_ean, custom_name, expiry_date) VALUES (?, ?, ?, ?)',
      [id, ean, customName, expiryDate]
    );
  }

  async getDefinitionsPendingNormalization(limit = 50): Promise<PendingNormalizationRecord[]> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 50;
    const result = db.execute(
      `SELECT ean, name
       FROM product_definitions
       WHERE normalized_name IS NULL
         AND TRIM(name) <> ''
       ORDER BY ean
       LIMIT ?`,
      [safeLimit],
    );

    const pending: PendingNormalizationRecord[] = [];
    if (!result.rows) {
      return pending;
    }

    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows.item(i);
      const ean = String(row.ean ?? '').trim();
      const name = String(row.name ?? '').trim();
      if (!ean || !name) {
        continue;
      }
      pending.push({ ean, name });
    }
    return pending;
  }

  async batchUpdateNormalizedNames(updates: NormalizationUpdateRecord[]): Promise<number> {
    let updatedCount = 0;

    for (const update of updates) {
      const ean = update.ean.trim();
      const normalizedName = update.normalizedName.trim();
      if (!ean || !normalizedName) {
        continue;
      }

      db.execute(
        `UPDATE product_definitions
         SET normalized_name = ?
         WHERE ean = ?
           AND (normalized_name IS NULL OR TRIM(normalized_name) = '')`,
        [normalizedName, ean],
      );
      updatedCount += 1;
    }

    return updatedCount;
  }

  async getRecipeIngredientNames(): Promise<string[]> {
    const result = db.execute(
      `SELECT i.custom_name, d.normalized_name, d.name
       FROM inventory i
       LEFT JOIN product_definitions d ON i.product_ean = d.ean
       ORDER BY i.expiry_date ASC`,
    );

    const names: string[] = [];
    if (!result.rows) {
      return names;
    }

    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows.item(i);
      const normalizedName = typeof row.normalized_name === 'string' ? row.normalized_name.trim() : '';
      const definitionName = typeof row.name === 'string' ? row.name.trim() : '';
      const customName = typeof row.custom_name === 'string' ? row.custom_name.trim() : '';

      const selected = normalizedName || definitionName || customName;
      if (selected) {
        names.push(selected);
      }
    }

    return names;
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
          expiryDate: row.expiry_date ?? null,
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

  async getRecipeModelConsent(): Promise<boolean> {
    const result = db.execute('SELECT value FROM app_settings WHERE key = ?', [
      ProductRepository.RECIPE_MODEL_CONSENT_KEY,
    ]);
    if (!result.rows || result.rows.length === 0) {
      return false;
    }
    const row = result.rows.item(0);
    return row.value === '1';
  }

  async setRecipeModelConsent(granted: boolean): Promise<void> {
    db.execute(
      'INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)',
      [ProductRepository.RECIPE_MODEL_CONSENT_KEY, granted ? '1' : '0'],
    );
  }
}