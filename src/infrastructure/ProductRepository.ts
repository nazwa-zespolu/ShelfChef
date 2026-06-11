import { db } from './db/init';
import { CatalogProduct, DietaryFlags, ProductDefinition, InventoryItem } from '../domain/types';
import { DietPreference } from '../features/recipe-generator/domain/recipeGenerationTypes';
import {
  DietaryCategorizationCandidate,
  DietaryCategorizationUpdate,
  matchesDietPreference,
} from '../features/recipe-generator/domain/dietaryCategorizationTypes';

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

export interface ProductRepositoryDebugSnapshot {
  productDefinitions: Record<string, unknown>[];
  inventory: Record<string, unknown>[];
  appSettings: Record<string, unknown>[];
}

export class ProductRepository {
  private static readonly RECIPE_MODEL_CONSENT_KEY = 'recipe_model_download_consent';

  async findDefinitionByEan(ean: string): Promise<ProductDefinition | null> {
    const result = db.execute('SELECT * FROM product_definitions WHERE ean = ?', [ean]);
    if (result.rows && result.rows.length > 0) {
      const row = result.rows.item(0);
      const dietary = this.readDietaryFlagsFromRow(row);
      return {
        ean: row.ean,
        name: row.name,
        brand: row.brand,
        imageUrl: row.image_url,
        category: row.category,
        ...(dietary ? { dietary } : {}),
      };
    }
    return null;
  }

  async saveDefinition(def: ProductDefinition): Promise<void> {
    const dietary = def.dietary;
    db.execute(
      `INSERT INTO product_definitions (
         ean, name, brand, image_url, category,
         is_vegetarian, is_vegan, is_gluten_free, is_lactose_free
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(ean) DO UPDATE SET
         name = excluded.name,
         brand = excluded.brand,
         image_url = excluded.image_url,
         category = excluded.category,
         is_vegetarian = COALESCE(excluded.is_vegetarian, product_definitions.is_vegetarian),
         is_vegan = COALESCE(excluded.is_vegan, product_definitions.is_vegan),
         is_gluten_free = COALESCE(excluded.is_gluten_free, product_definitions.is_gluten_free),
         is_lactose_free = COALESCE(excluded.is_lactose_free, product_definitions.is_lactose_free)`,
      [
        def.ean,
        def.name,
        def.brand,
        def.imageUrl,
        def.category,
        dietary?.isVegetarian ?? null,
        dietary?.isVegan ?? null,
        dietary?.isGlutenFree ?? null,
        dietary?.isLactoseFree ?? null,
      ],
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
      [id, ean, customName, expiryDate],
    );
  }

  async countItemsPendingDietaryCategorization(): Promise<number> {
    const result = db.execute(
      `SELECT COUNT(*) AS count
       FROM inventory i
       LEFT JOIN product_definitions d ON i.product_ean = d.ean
       WHERE (
         i.product_ean IS NOT NULL
         AND TRIM(COALESCE(d.name, '')) <> ''
         AND d.is_vegetarian IS NULL
       ) OR (
         i.product_ean IS NULL
         AND TRIM(COALESCE(i.custom_name, '')) <> ''
         AND i.is_vegetarian IS NULL
       )`,
    );

    if (!result.rows || result.rows.length === 0) {
      return 0;
    }

    const raw = result.rows.item(0).count;
    const count = Number(raw);
    return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  }

  async getItemsPendingDietaryCategorization(
    limit = 50,
  ): Promise<DietaryCategorizationCandidate[]> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 50;
    const result = db.execute(
      `SELECT i.id AS inventory_id, i.product_ean, i.custom_name, d.name AS definition_name
       FROM inventory i
       LEFT JOIN product_definitions d ON i.product_ean = d.ean
       WHERE (
         i.product_ean IS NOT NULL
         AND TRIM(COALESCE(d.name, '')) <> ''
         AND d.is_vegetarian IS NULL
       ) OR (
         i.product_ean IS NULL
         AND TRIM(COALESCE(i.custom_name, '')) <> ''
         AND i.is_vegetarian IS NULL
       )
       ORDER BY i.id
       LIMIT ?`,
      [safeLimit],
    );

    const pending: DietaryCategorizationCandidate[] = [];
    if (!result.rows) {
      return pending;
    }

    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows.item(i);
      const inventoryId = String(row.inventory_id ?? '').trim();
      const productEan =
        row.product_ean == null ? undefined : String(row.product_ean).trim() || undefined;
      const name = productEan
        ? String(row.definition_name ?? '').trim()
        : String(row.custom_name ?? '').trim();

      if (!inventoryId || !name) {
        continue;
      }

      pending.push({
        inventoryId,
        productEan,
        name,
      });
    }

    return pending;
  }

  async batchUpdateDietaryCategorization(
    updates: DietaryCategorizationUpdate[],
  ): Promise<number> {
    let updatedCount = 0;

    for (const update of updates) {
      const flags = update.flags;
      const values = [
        flags.isVegetarian ? 1 : 0,
        flags.isVegan ? 1 : 0,
        flags.isGlutenFree ? 1 : 0,
        flags.isLactoseFree ? 1 : 0,
      ];

      if (update.productEan) {
        db.execute(
          `UPDATE product_definitions
           SET is_vegetarian = ?, is_vegan = ?, is_gluten_free = ?, is_lactose_free = ?
           WHERE ean = ?
             AND is_vegetarian IS NULL`,
          [...values, update.productEan],
        );
        updatedCount += 1;
      } else if (update.inventoryId) {
        db.execute(
          `UPDATE inventory
           SET is_vegetarian = ?, is_vegan = ?, is_gluten_free = ?, is_lactose_free = ?
           WHERE id = ?
             AND is_vegetarian IS NULL`,
          [...values, update.inventoryId],
        );
        updatedCount += 1;
      }
    }

    return updatedCount;
  }

  async resetAllDietaryCategorization(): Promise<number> {
    const before = db.execute(
      `SELECT COUNT(*) AS count
       FROM inventory i
       LEFT JOIN product_definitions d ON i.product_ean = d.ean
       WHERE (
         i.product_ean IS NOT NULL AND d.is_vegetarian IS NOT NULL
       ) OR (
         i.product_ean IS NULL AND i.is_vegetarian IS NOT NULL
       )`,
    );
    const resetCount =
      before.rows && before.rows.length > 0
        ? Number(before.rows.item(0).count ?? 0)
        : 0;

    db.execute(
      `UPDATE product_definitions
       SET is_vegetarian = NULL, is_vegan = NULL, is_gluten_free = NULL, is_lactose_free = NULL
       WHERE is_vegetarian IS NOT NULL`,
    );
    db.execute(
      `UPDATE inventory
       SET is_vegetarian = NULL, is_vegan = NULL, is_gluten_free = NULL, is_lactose_free = NULL
       WHERE is_vegetarian IS NOT NULL`,
    );

    return resetCount;
  }

  async getRecipeIngredientNames(diet: DietPreference = 'none'): Promise<string[]> {
    const result = db.execute(
      `SELECT
         i.custom_name,
         d.name AS definition_name,
         COALESCE(i.is_vegetarian, d.is_vegetarian) AS is_vegetarian,
         COALESCE(i.is_vegan, d.is_vegan) AS is_vegan,
         COALESCE(i.is_gluten_free, d.is_gluten_free) AS is_gluten_free,
         COALESCE(i.is_lactose_free, d.is_lactose_free) AS is_lactose_free
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
      const definitionName =
        typeof row.definition_name === 'string' ? row.definition_name.trim() : '';
      const customName =
        typeof row.custom_name === 'string' ? row.custom_name.trim() : '';
      const displayName = definitionName || customName;
      if (!displayName) {
        continue;
      }

      const dietary = this.readDietaryFlagsFromRow(row);
      if (!matchesDietPreference(dietary, diet)) {
        continue;
      }

      names.push(displayName);
    }

    return names;
  }

  async getDebugSnapshot(limit = 200): Promise<ProductRepositoryDebugSnapshot> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 200;

    const productDefinitions = this.rowsToArray(
      db.execute(
        `SELECT ean, name, brand, category,
                is_vegetarian, is_vegan, is_gluten_free, is_lactose_free
         FROM product_definitions
         ORDER BY ean
         LIMIT ?`,
        [safeLimit],
      ),
    );
    const inventory = this.rowsToArray(
      db.execute(
        `SELECT id, product_ean, custom_name, expiry_date, is_opened, opened_at,
                is_vegetarian, is_vegan, is_gluten_free, is_lactose_free
         FROM inventory
         ORDER BY expiry_date ASC
         LIMIT ?`,
        [safeLimit],
      ),
    );
    const appSettings = this.rowsToArray(
      db.execute(
        `SELECT key, value
         FROM app_settings
         ORDER BY key
         LIMIT ?`,
        [safeLimit],
      ),
    );

    return {
      productDefinitions,
      inventory,
      appSettings,
    };
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
          name: row.name || row.custom_name,
          brand: row.brand,
          imageUrl: row.image_url,
          category: row.category,
          expiryDate: row.expiry_date ?? null,
          openedAt: row.opened_at,
          isOpened: row.is_opened === 1,
        });
      }
    }
    return items;
  }

  async markAsOpened(id: string, date: string): Promise<void> {
    db.execute('UPDATE inventory SET is_opened = 1, opened_at = ? WHERE id = ?', [date, id]);
  }

  async markAsClosed(id: string): Promise<void> {
    db.execute('UPDATE inventory SET is_opened = 0, opened_at = NULL WHERE id = ?', [id]);
  }

  async removeFromInventory(id: string): Promise<void> {
    db.execute('DELETE FROM inventory WHERE id = ?', [id]);
  }

  async getRecipeModelConsent(): Promise<boolean> {
    const state = await this.getRecipeModelConsentState();
    return state === 'accepted';
  }

  async getRecipeModelConsentState(): Promise<'unknown' | 'accepted' | 'declined'> {
    const result = db.execute('SELECT value FROM app_settings WHERE key = ?', [
      ProductRepository.RECIPE_MODEL_CONSENT_KEY,
    ]);
    if (!result.rows || result.rows.length === 0) {
      return 'unknown';
    }
    const row = result.rows.item(0);
    return row.value === '1' ? 'accepted' : 'declined';
  }

  async setRecipeModelConsent(granted: boolean): Promise<void> {
    db.execute(
      'INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)',
      [ProductRepository.RECIPE_MODEL_CONSENT_KEY, granted ? '1' : '0'],
    );
  }

  private readDietaryFlagsFromRow(
    row: Record<string, unknown>,
  ): DietaryFlags | null {
    if (row.is_vegetarian == null) {
      return null;
    }

    return {
      isVegetarian: Number(row.is_vegetarian) === 1,
      isVegan: Number(row.is_vegan) === 1,
      isGlutenFree: Number(row.is_gluten_free) === 1,
      isLactoseFree: Number(row.is_lactose_free) === 1,
    };
  }

  private rowsToArray(result: {
    rows?: { length: number; item: (index: number) => Record<string, unknown> };
  }): Record<string, unknown>[] {
    if (!result.rows) {
      return [];
    }

    const out: Record<string, unknown>[] = [];
    for (let i = 0; i < result.rows.length; i++) {
      out.push(result.rows.item(i));
    }
    return out;
  }
}
