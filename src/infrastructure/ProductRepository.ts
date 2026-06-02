import { db } from './db/init';
import { CatalogProduct, ProductDefinition, InventoryItem } from '../domain/types';

export function normalizeProductName(name: string): string {
  return name.trim().toLowerCase();
}

function mapCatalogProduct(row: Record<string, any>): CatalogProduct {
  return {
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
    kind: row.kind,
    productEan: row.product_ean ?? null,
    imageUrl: row.image_url ?? null,
    parentCatalogProductId: row.parent_catalog_product_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
    db.execute(
      `
        INSERT OR REPLACE INTO product_catalog (
          id,
          name,
          normalized_name,
          kind,
          product_ean,
          parent_catalog_product_id,
          created_at,
          updated_at
        )
        VALUES (
          COALESCE((SELECT id FROM product_catalog WHERE product_ean = ?), ?),
          ?,
          ?,
          'specific',
          ?,
          COALESCE((SELECT parent_catalog_product_id FROM product_catalog WHERE product_ean = ?), NULL),
          COALESCE((SELECT created_at FROM product_catalog WHERE product_ean = ?), datetime('now')),
          datetime('now')
        )
      `,
      [
        def.ean,
        `catalog-specific-${def.ean}`,
        def.name,
        normalizeProductName(def.name),
        def.ean,
        def.ean,
        def.ean,
      ],
    );
  }

  async findCatalogProductByEan(ean: string): Promise<CatalogProduct | null> {
    const result = db.execute(
      `
        SELECT
          catalog.*,
          definition.image_url
        FROM product_catalog catalog
        LEFT JOIN product_definitions definition ON catalog.product_ean = definition.ean
        WHERE catalog.product_ean = ?
      `,
      [ean],
    );
    if (!result.rows || result.rows.length === 0) {
      return null;
    }
    return mapCatalogProduct(result.rows.item(0));
  }

  async searchDefinitions(query: string): Promise<ProductDefinition[]> {
    const q = `%${normalizeProductName(query)}%`;
    const result = db.execute(
      `
        SELECT *
        FROM product_definitions
        WHERE lower(name) LIKE ? OR lower(COALESCE(brand, '')) LIKE ? OR ean LIKE ?
        ORDER BY name ASC
        LIMIT 20
      `,
      [q, q, `%${query.trim()}%`],
    );
    const definitions: ProductDefinition[] = [];
    if (result.rows) {
      for (let i = 0; i < result.rows.length; i++) {
        const row = result.rows.item(i);
        definitions.push({
          ean: row.ean,
          name: row.name,
          brand: row.brand,
          imageUrl: row.image_url,
          category: row.category,
        });
      }
    }
    return definitions;
  }

  async countFreshInventoryByEan(ean: string, todayIso: string): Promise<number> {
    const result = db.execute(
      `
        SELECT COUNT(*) AS count
        FROM inventory
        WHERE product_ean = ?
          AND (expiry_date IS NULL OR expiry_date >= ?)
      `,
      [ean, todayIso],
    );
    if (!result.rows || result.rows.length === 0) {
      return 0;
    }
    return Number(result.rows.item(0).count ?? 0);
  }

  async countFreshInventoryByCustomName(name: string, todayIso: string): Promise<number> {
    const result = db.execute(
      `
        SELECT COUNT(*) AS count
        FROM inventory
        WHERE product_ean IS NULL
          AND lower(trim(custom_name)) = ?
          AND (expiry_date IS NULL OR expiry_date >= ?)
      `,
      [normalizeProductName(name), todayIso],
    );
    if (!result.rows || result.rows.length === 0) {
      return 0;
    }
    return Number(result.rows.item(0).count ?? 0);
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

  async getFullInventory(): Promise<InventoryItem[]> {
    const query = `
      SELECT 
        i.id, i.expiry_date, i.opened_at, i.is_opened, i.custom_name,
        COALESCE(d.ean, i.product_ean) AS ean,
        d.name, d.brand, d.image_url, d.category
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
