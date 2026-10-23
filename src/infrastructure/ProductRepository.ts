import { db, runInTransaction } from './db/init';
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
    brand: row.brand ?? null,
    category: row.category ?? null,
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

export interface UpdateInventoryItemInput {
  expiryDate: string | null;
  openedAt: string | null;
}

export interface SaveGenericCatalogProductInput {
  name: string;
  brand?: string | null;
  category?: string | null;
  imageUrl?: string | null;
}

export interface UpdateCatalogProductInput {
  name: string;
  brand: string | null;
  category: string | null;
  // Omitted keeps the current photo; null explicitly removes it.
  imageUrl?: string | null;
}

export class CatalogProductUpdateError extends Error {
  constructor(
    readonly code: 'empty_name' | 'duplicate_name' | 'not_found',
    message: string,
  ) {
    super(message);
    this.name = 'CatalogProductUpdateError';
  }
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
    runInTransaction(() => {
      // Adding another copy must never edit the shared product definition.
      // Existing products are edited explicitly through updateCatalogProduct.
      const existing = db.execute('SELECT ean FROM product_definitions WHERE ean = ?', [def.ean]);
      if (existing.rows?.length) {
        return;
      }
      const dietary = def.dietary;
      db.execute(
        `INSERT INTO product_definitions (
           ean, name, brand, image_url, category,
           is_vegetarian, is_vegan, is_gluten_free, is_lactose_free
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(ean) DO NOTHING`,
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
        `INSERT INTO product_catalog (
           id, name, normalized_name, kind, product_ean, image_url,
           parent_catalog_product_id, created_at, updated_at
         )
         VALUES (?, ?, ?, 'specific', ?, ?, NULL, datetime('now'), datetime('now'))
         ON CONFLICT(product_ean) WHERE product_ean IS NOT NULL DO NOTHING`,
        [
          `catalog-specific-${def.ean}`,
          def.name,
          normalizeProductName(def.name),
          def.ean,
          def.imageUrl ?? null,
        ],
      );
    });
  }

  async saveGenericCatalogProduct(input: SaveGenericCatalogProductInput): Promise<CatalogProduct> {
    const trimmedName = input.name.trim();
    const normalizedName = normalizeProductName(trimmedName);
    const id = `catalog-generic-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    db.execute(
      `
        INSERT INTO product_catalog (
          id,
          name,
          normalized_name,
          kind,
          product_ean,
          brand,
          category,
          image_url,
          parent_catalog_product_id,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, 'generic', NULL, ?, ?, ?, NULL, datetime('now'), datetime('now'))
        ON CONFLICT(kind, normalized_name) WHERE kind = 'generic' DO UPDATE SET
          name = excluded.name,
          brand = COALESCE(excluded.brand, product_catalog.brand),
          category = COALESCE(excluded.category, product_catalog.category),
          image_url = COALESCE(excluded.image_url, product_catalog.image_url),
          updated_at = datetime('now')
      `,
      [
        id,
        trimmedName,
        normalizedName,
        input.brand?.trim() || null,
        input.category?.trim() || null,
        input.imageUrl ?? null,
      ],
    );

    const found = await this.findCatalogProductByNormalizedName('generic', normalizedName);
    if (!found) {
      throw new Error(`Catalog product not found after save: ${trimmedName}`);
    }
    return found;
  }

  async findCatalogProductByNormalizedName(
    kind: CatalogProduct['kind'],
    normalizedName: string,
  ): Promise<CatalogProduct | null> {
    return this.readCatalogProducts('catalog.kind = ? AND catalog.normalized_name = ?', [kind, normalizedName])[0] ?? null;
  }

  async findCatalogProductByEan(ean: string): Promise<CatalogProduct | null> {
    return this.readCatalogProducts('catalog.product_ean = ?', [ean])[0] ?? null;
  }

  async findCatalogProductById(id: string): Promise<CatalogProduct | null> {
    return this.readCatalogProducts('catalog.id = ?', [id])[0] ?? null;
  }

  async getCatalogProducts(): Promise<CatalogProduct[]> {
    return this.readCatalogProducts('1 = 1');
  }

  async searchCatalogProducts(query: string, limit?: number): Promise<CatalogProduct[]> {
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
      throw new Error('Catalog search limit must be a positive integer');
    }
    const escapedQuery = normalizeProductName(query).replace(/[\\%_]/g, character => `\\${character}`);
    const pattern = `%${escapedQuery}%`;
    return this.readCatalogProducts(
      "catalog.normalized_name LIKE ? ESCAPE '\\' OR catalog.product_ean LIKE ? ESCAPE '\\'",
      [pattern, pattern],
      limit,
    );
  }

  async updateCatalogProduct(id: string, input: UpdateCatalogProductInput): Promise<CatalogProduct> {
    const name = input.name.trim();
    if (!name) {
      throw new CatalogProductUpdateError('empty_name', 'Product name cannot be empty');
    }
    const normalizedName = normalizeProductName(name);
    const brand = input.brand?.trim() || null;
    const category = input.category?.trim() || null;

    return runInTransaction(() => {
      const product = this.readCatalogProducts('catalog.id = ?', [id])[0];
      if (!product) {
        throw new CatalogProductUpdateError('not_found', `Catalog product not found: ${id}`);
      }
      const imageUrl = input.imageUrl === undefined ? product.imageUrl : input.imageUrl;
      if (product.kind === 'generic') {
        const duplicate = this.readCatalogProducts(
          "catalog.kind = 'generic' AND catalog.normalized_name = ? AND catalog.id <> ?",
          [normalizedName, id],
        )[0];
        if (duplicate) {
          throw new CatalogProductUpdateError('duplicate_name', 'A generic product with this name already exists');
        }
        db.execute(
          `UPDATE product_catalog
           SET name = ?, normalized_name = ?, brand = ?, category = ?, image_url = ?, updated_at = datetime('now')
           WHERE id = ?`,
          [name, normalizedName, brand, category, imageUrl, id],
        );
      } else {
        const definition = db.execute('SELECT ean FROM product_definitions WHERE ean = ?', [product.productEan]);
        if (!definition.rows?.length) {
          throw new CatalogProductUpdateError('not_found', `Product definition not found: ${product.productEan}`);
        }
        db.execute(
          'UPDATE product_definitions SET name = ?, brand = ?, category = ?, image_url = ? WHERE ean = ?',
          [name, brand, category, imageUrl, product.productEan],
        );
        db.execute(
          `UPDATE product_catalog SET name = ?, normalized_name = ?, image_url = ?, updated_at = datetime('now') WHERE id = ?`,
          [name, normalizedName, imageUrl, id],
        );
      }
      return this.readCatalogProducts('catalog.id = ?', [id])[0];
    });
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
        FROM inventory i
        LEFT JOIN product_catalog catalog ON i.catalog_product_id = catalog.id
        WHERE i.product_ean IS NULL
          AND COALESCE(catalog.normalized_name, lower(trim(i.custom_name))) = ?
          AND (i.expiry_date IS NULL OR i.expiry_date >= ?)
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
    catalogProductId?: string,
  ): Promise<void> {
    let resolvedCatalogId: string | null = null;
    if (catalogProductId !== undefined) {
      const result = db.execute('SELECT id, product_ean FROM product_catalog WHERE id = ?', [catalogProductId]);
      const catalog = result.rows?.length ? result.rows.item(0) : null;
      if (!catalog) {
        throw new Error(`Catalog product not found: ${catalogProductId}`);
      }
      if ((catalog.product_ean ?? null) !== ean) {
        throw new Error('Inventory EAN does not match the catalog product');
      }
      resolvedCatalogId = catalog.id;
    } else if (ean) {
      resolvedCatalogId = (await this.findCatalogProductByEan(ean))?.id ?? null;
    } else if (customName) {
      resolvedCatalogId = (await this.findCatalogProductByNormalizedName(
        'generic', normalizeProductName(customName),
      ))?.id ?? null;
    }

    db.execute(
      `INSERT INTO inventory (
        id,
        catalog_product_id,
        product_ean,
        custom_name,
        expiry_date,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, resolvedCatalogId, ean, customName, expiryDate, new Date().toISOString()],
    );
  }

  async countItemsPendingDietaryCategorization(): Promise<number> {
    const result = db.execute(
      `SELECT COUNT(*) AS count
       FROM inventory i
       LEFT JOIN product_definitions d ON i.product_ean = d.ean
       LEFT JOIN product_catalog catalog ON i.catalog_product_id = catalog.id
       WHERE (
         i.product_ean IS NOT NULL
         AND TRIM(COALESCE(d.name, '')) <> ''
         AND d.is_vegetarian IS NULL
       ) OR (
         i.product_ean IS NULL
         AND TRIM(COALESCE(catalog.name, i.custom_name, '')) <> ''
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
      `SELECT i.id AS inventory_id, i.product_ean,
              COALESCE(catalog.name, i.custom_name) AS custom_name, d.name AS definition_name
       FROM inventory i
       LEFT JOIN product_definitions d ON i.product_ean = d.ean
       LEFT JOIN product_catalog catalog ON i.catalog_product_id = catalog.id
       WHERE (
         i.product_ean IS NOT NULL
         AND TRIM(COALESCE(d.name, '')) <> ''
         AND d.is_vegetarian IS NULL
       ) OR (
         i.product_ean IS NULL
         AND TRIM(COALESCE(catalog.name, i.custom_name, '')) <> ''
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
         COALESCE(catalog.name, i.custom_name) AS custom_name,
         d.name AS definition_name,
         COALESCE(i.is_vegetarian, d.is_vegetarian) AS is_vegetarian,
         COALESCE(i.is_vegan, d.is_vegan) AS is_vegan,
         COALESCE(i.is_gluten_free, d.is_gluten_free) AS is_gluten_free,
         COALESCE(i.is_lactose_free, d.is_lactose_free) AS is_lactose_free
       FROM inventory i
       LEFT JOIN product_definitions d ON i.product_ean = d.ean
       LEFT JOIN product_catalog catalog ON i.catalog_product_id = catalog.id
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
        `SELECT id, catalog_product_id, product_ean, custom_name, expiry_date, is_opened, opened_at,
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
        i.id, i.catalog_product_id, i.expiry_date, i.opened_at, i.is_opened, i.custom_name, i.created_at,
        COALESCE(d.ean, i.product_ean) AS ean,
        COALESCE(d.name, catalog.name, i.custom_name) AS name,
        COALESCE(d.brand, catalog.brand) AS brand,
        COALESCE(catalog.image_url, d.image_url) AS image_url,
        COALESCE(d.category, catalog.category) AS category
      FROM inventory i
      LEFT JOIN product_definitions d ON i.product_ean = d.ean
      LEFT JOIN product_catalog catalog ON i.catalog_product_id = catalog.id
      ORDER BY i.expiry_date ASC
    `;

    const result = db.execute(query);
    const items: InventoryItem[] = [];

    if (result.rows) {
      for (let i = 0; i < result.rows.length; i++) {
        const row = result.rows.item(i);
        items.push({
          id: row.id,
          catalogProductId: row.catalog_product_id ?? null,
          ean: row.ean || '',
          name: row.name || row.custom_name,
          brand: row.brand,
          imageUrl: row.image_url,
          category: row.category,
          expiryDate: row.expiry_date ?? null,
          openedAt: row.opened_at,
          isOpened: row.is_opened === 1,
          createdAt: row.created_at,
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

  async updateInventoryItem(id: string, input: UpdateInventoryItemInput): Promise<void> {
    db.execute(
      `UPDATE inventory
       SET expiry_date = ?, is_opened = ?, opened_at = ?
       WHERE id = ?`,
      [input.expiryDate, input.openedAt === null ? 0 : 1, input.openedAt, id],
    );
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

  private readCatalogProducts(
    condition: string,
    params: (string | number)[] = [],
    limit?: number,
  ): CatalogProduct[] {
    const result = db.execute(
      `SELECT catalog.*,
              COALESCE(definition.brand, catalog.brand) AS brand,
              COALESCE(definition.category, catalog.category) AS category,
              COALESCE(catalog.image_url, definition.image_url) AS image_url
       FROM product_catalog catalog
       LEFT JOIN product_definitions definition ON catalog.product_ean = definition.ean
       WHERE ${condition}
       ORDER BY catalog.kind ASC, catalog.name ASC, catalog.id ASC
       ${limit === undefined ? '' : 'LIMIT ?'}`,
      limit === undefined ? params : [...params, limit],
    );
    const products: CatalogProduct[] = [];
    if (result.rows) {
      for (let index = 0; index < result.rows.length; index++) {
        products.push(mapCatalogProduct(result.rows.item(index)));
      }
    }
    return products;
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
