import {
  CatalogProduct,
  CatalogProductKind,
  ShoppingItemSource,
  ShoppingItemStatus,
  ShoppingListItem,
  ShoppingListSummary,
  ShoppingListType,
  ShoppingSuggestion,
} from '../domain/types';
import {normalizeProductName} from './ProductRepository';
import {db, runInTransaction} from './db/init';

export type AddShoppingItemInput = {
  catalogProductId?: string | null;
  label: string;
  quantity?: number;
  source?: ShoppingItemSource;
  status?: ShoppingItemStatus;
};

export type AddAllSuggestionsSummary = {
  added: number;
  reactivated: number;
  skipped: number;
};

export type CompletePurchaseResult = {
  inventoryIds: string[];
  storedItemIds: string[];
};

function nowIso(): string {
  return new Date().toISOString();
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function mapCatalogProduct(row: Record<string, any>): CatalogProduct {
  return {
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
    kind: row.kind,
    productEan: row.product_ean ?? null,
    parentCatalogProductId: row.parent_catalog_product_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapShoppingList(row: Record<string, any>): ShoppingListSummary {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    isLocked: row.is_locked === 1,
    isArchived: row.is_archived === 1,
    sortOrder: Number(row.sort_order ?? 0),
    lockedAt: row.locked_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapShoppingItem(row: Record<string, any>): ShoppingListItem {
  return {
    id: row.id,
    listId: row.list_id,
    catalogProductId: row.catalog_product_id ?? null,
    label: row.label,
    quantity: Number(row.quantity),
    status: row.status,
    source: row.source,
    storedAt: row.stored_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ShoppingListRepository {
  async createList(name: string, type: ShoppingListType): Promise<ShoppingListSummary> {
    const timestamp = nowIso();
    const id = generateId('shopping-list');
    const orderResult = db.execute(
      'SELECT COALESCE(MAX(sort_order), -1) AS max_sort_order FROM shopping_lists',
    );
    const sortOrder = Number(orderResult.rows?.item(0)?.max_sort_order ?? -1) + 1;
    db.execute(
      `
        INSERT INTO shopping_lists (
          id,
          name,
          type,
          is_locked,
          is_archived,
          sort_order,
          locked_at,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, 0, 0, ?, NULL, ?, ?)
      `,
      [id, name.trim(), type, sortOrder, timestamp, timestamp],
    );
    return {
      id,
      name: name.trim(),
      type,
      isLocked: false,
      isArchived: false,
      sortOrder,
      lockedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  async getLists(includeArchived = false): Promise<ShoppingListSummary[]> {
    const result = db.execute(
      `
        SELECT *
        FROM shopping_lists
        WHERE (? = 1 OR is_archived = 0)
        ORDER BY sort_order ASC, created_at ASC
      `,
      [includeArchived ? 1 : 0],
    );
    const lists: ShoppingListSummary[] = [];
    if (result.rows) {
      for (let i = 0; i < result.rows.length; i++) {
        lists.push(mapShoppingList(result.rows.item(i)));
      }
    }
    return lists;
  }

  async getListById(id: string): Promise<ShoppingListSummary | null> {
    const result = db.execute('SELECT * FROM shopping_lists WHERE id = ?', [id]);
    if (!result.rows || result.rows.length === 0) {
      return null;
    }
    return mapShoppingList(result.rows.item(0));
  }

  async deleteList(id: string): Promise<void> {
    runInTransaction(() => {
      db.execute('DELETE FROM shopping_list_items WHERE list_id = ?', [id]);
      db.execute('DELETE FROM shopping_lists WHERE id = ?', [id]);
    });
  }

  async updateListOrder(listIds: string[]): Promise<void> {
    runInTransaction(() => {
      const timestamp = nowIso();
      listIds.forEach((id, index) => {
        db.execute(
          `
            UPDATE shopping_lists
            SET sort_order = ?,
                updated_at = ?
            WHERE id = ?
          `,
          [index, timestamp, id],
        );
      });
    });
  }

  async setListLocked(id: string, locked: boolean): Promise<void> {
    db.execute(
      `
        UPDATE shopping_lists
        SET is_locked = ?,
            locked_at = ?,
            updated_at = ?
        WHERE id = ?
      `,
      [locked ? 1 : 0, locked ? nowIso() : null, nowIso(), id],
    );
  }

  async getItems(listId: string): Promise<ShoppingListItem[]> {
    const result = db.execute(
      `
        SELECT *
        FROM shopping_list_items
        WHERE list_id = ?
        ORDER BY created_at ASC
      `,
      [listId],
    );
    const items: ShoppingListItem[] = [];
    if (result.rows) {
      for (let i = 0; i < result.rows.length; i++) {
        items.push(mapShoppingItem(result.rows.item(i)));
      }
    }
    return items;
  }

  async getCatalogProducts(): Promise<CatalogProduct[]> {
    const result = db.execute(
      `
        SELECT *
        FROM product_catalog
        ORDER BY kind ASC, name ASC
      `,
    );
    const products: CatalogProduct[] = [];
    if (result.rows) {
      for (let i = 0; i < result.rows.length; i++) {
        products.push(mapCatalogProduct(result.rows.item(i)));
      }
    }
    return products;
  }

  async addItem(listId: string, input: AddShoppingItemInput): Promise<ShoppingListItem> {
    const list = await this.getListById(listId);
    if (!list) {
      throw new Error(`Shopping list not found: ${listId}`);
    }
    const timestamp = nowIso();
    const id = generateId('shopping-item');
    const quantity = Math.max(1, input.quantity ?? 1);
    const status = input.status ?? 'planned';
    const source = input.source ?? 'manual';
    db.execute(
      `
        INSERT INTO shopping_list_items (
          id,
          list_id,
          catalog_product_id,
          label,
          quantity,
          status,
          source,
          stored_at,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
      `,
      [
        id,
        listId,
        input.catalogProductId ?? null,
        input.label.trim(),
        quantity,
        status,
        source,
        timestamp,
        timestamp,
      ],
    );
    return {
      id,
      listId,
      catalogProductId: input.catalogProductId ?? null,
      label: input.label.trim(),
      quantity,
      status,
      source,
      storedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  async updateItemStatus(id: string, status: ShoppingItemStatus): Promise<void> {
    db.execute(
      `
        UPDATE shopping_list_items
        SET status = ?,
            stored_at = CASE WHEN ? = 'stored' THEN COALESCE(stored_at, ?) ELSE stored_at END,
            updated_at = ?
        WHERE id = ?
      `,
      [status, status, nowIso(), nowIso(), id],
    );
  }

  async updateItemStatusSnapshot(id: string, status: 'planned' | 'stored'): Promise<void> {
    db.execute(
      `
        UPDATE shopping_list_items
        SET status = ?,
            updated_at = ?
        WHERE id = ?
      `,
      [status, nowIso(), id],
    );
  }

  async updateItemQuantity(id: string, quantity: number): Promise<void> {
    db.execute(
      `
        UPDATE shopping_list_items
        SET quantity = ?,
            updated_at = ?
        WHERE id = ?
      `,
      [Math.max(1, quantity), nowIso(), id],
    );
  }

  async deleteItem(id: string): Promise<void> {
    db.execute('DELETE FROM shopping_list_items WHERE id = ?', [id]);
  }

  async createGenericCatalogProduct(name: string): Promise<CatalogProduct> {
    const timestamp = nowIso();
    const normalizedName = normalizeProductName(name);
    const id = generateId('catalog-generic');
    db.execute(
      `
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
        VALUES (?, ?, ?, 'generic', NULL, NULL, ?, ?)
      `,
      [id, name.trim(), normalizedName, timestamp, timestamp],
    );
    const existing = await this.findCatalogProductByNormalizedName('generic', normalizedName);
    if (existing) {
      return existing;
    }
    return {
      id,
      name: name.trim(),
      normalizedName,
      kind: 'generic',
      productEan: null,
      parentCatalogProductId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  async findCatalogProductById(id: string): Promise<CatalogProduct | null> {
    const result = db.execute('SELECT * FROM product_catalog WHERE id = ?', [id]);
    if (!result.rows || result.rows.length === 0) {
      return null;
    }
    return mapCatalogProduct(result.rows.item(0));
  }

  async findCatalogProductByNormalizedName(
    kind: CatalogProductKind,
    normalizedName: string,
  ): Promise<CatalogProduct | null> {
    const result = db.execute(
      'SELECT * FROM product_catalog WHERE kind = ? AND normalized_name = ?',
      [kind, normalizedName],
    );
    if (!result.rows || result.rows.length === 0) {
      return null;
    }
    return mapCatalogProduct(result.rows.item(0));
  }

  async searchCatalogProducts(query: string): Promise<CatalogProduct[]> {
    const q = `%${normalizeProductName(query)}%`;
    const result = db.execute(
      `
        SELECT *
        FROM product_catalog
        WHERE normalized_name LIKE ?
        ORDER BY kind ASC, name ASC
        LIMIT 20
      `,
      [q],
    );
    const products: CatalogProduct[] = [];
    if (result.rows) {
      for (let i = 0; i < result.rows.length; i++) {
        products.push(mapCatalogProduct(result.rows.item(i)));
      }
    }
    return products;
  }

  async addAllSuggestionsToManualList(
    targetManualListId: string,
    suggestions: ShoppingSuggestion[],
  ): Promise<AddAllSuggestionsSummary> {
    const list = await this.getListById(targetManualListId);
    if (!list) {
      throw new Error(`Shopping list not found: ${targetManualListId}`);
    }
    if (list.type !== 'manual') {
      throw new Error('Suggestions can only be added to manual lists');
    }

    const summary: AddAllSuggestionsSummary = {added: 0, reactivated: 0, skipped: 0};
    runInTransaction(() => {
      for (const suggestion of suggestions) {
        const existing = this.findTargetItemForSuggestion(targetManualListId, suggestion);
        if (!existing) {
          const timestamp = nowIso();
          db.execute(
            `
              INSERT INTO shopping_list_items (
                id,
                list_id,
                catalog_product_id,
                label,
                quantity,
                status,
                source,
                stored_at,
                created_at,
                updated_at
              )
              VALUES (?, ?, ?, ?, ?, 'planned', 'suggestion', NULL, ?, ?)
            `,
            [
              generateId('shopping-item'),
              targetManualListId,
              suggestion.catalogProductId,
              suggestion.name,
              Math.max(1, suggestion.missingQuantity),
              timestamp,
              timestamp,
            ],
          );
          summary.added += 1;
          continue;
        }

        if (existing.status === 'purchased') {
          summary.skipped += 1;
          continue;
        }

        const nextQuantity = Math.max(existing.quantity, suggestion.missingQuantity);
        const timestamp = nowIso();
        if (existing.status === 'planned') {
          db.execute(
            'UPDATE shopping_list_items SET quantity = ?, updated_at = ? WHERE id = ?',
            [nextQuantity, timestamp, existing.id],
          );
          summary.skipped += 1;
          continue;
        }

        db.execute(
          `
            UPDATE shopping_list_items
            SET status = 'planned',
                quantity = ?,
                source = 'reactivated',
                stored_at = NULL,
                updated_at = ?
            WHERE id = ?
          `,
          [nextQuantity, timestamp, existing.id],
        );
        summary.reactivated += 1;
      }
    });
    return summary;
  }

  async completePurchase(
    listId: string,
    expiryDateByItemId: Record<string, string | null> = {},
  ): Promise<CompletePurchaseResult> {
    const inventoryIds: string[] = [];
    const storedItemIds: string[] = [];
    runInTransaction(() => {
      const listResult = db.execute(
        'SELECT type FROM shopping_lists WHERE id = ?',
        [listId],
      );
      if (!listResult.rows || listResult.rows.length === 0) {
        throw new Error(`Shopping list not found: ${listId}`);
      }
      const listType = listResult.rows.item(0).type as ShoppingListType;
      const result = db.execute(
        `
          SELECT
            i.id,
            i.label,
            i.quantity,
            i.catalog_product_id,
            d.ean AS product_ean
          FROM shopping_list_items i
          LEFT JOIN product_catalog c ON i.catalog_product_id = c.id
          LEFT JOIN product_definitions d ON c.product_ean = d.ean
          WHERE i.list_id = ?
            AND i.status = 'purchased'
        `,
        [listId],
      );

      if (result.rows) {
        for (let i = 0; i < result.rows.length; i++) {
          const row = result.rows.item(i);
          const quantity = Number(row.quantity);
          for (let n = 0; n < quantity; n++) {
            const inventoryId = generateId('inv');
            inventoryIds.push(inventoryId);
            db.execute(
              'INSERT INTO inventory (id, product_ean, custom_name, expiry_date) VALUES (?, ?, ?, ?)',
              [
                inventoryId,
                row.product_ean ?? null,
                row.label,
                expiryDateByItemId[row.id] ?? null,
              ],
            );
          }
          storedItemIds.push(row.id);
          if (listType === 'auto') {
            db.execute(
              `
                UPDATE shopping_list_items
                SET status = 'stored',
                    stored_at = ?,
                    updated_at = ?
                WHERE id = ?
              `,
              [nowIso(), nowIso(), row.id],
            );
          }
        }
      }
      if (listType === 'manual') {
        db.execute(
          `
            UPDATE shopping_list_items
            SET status = 'planned',
                stored_at = NULL,
                updated_at = ?
            WHERE list_id = ?
          `,
          [nowIso(), listId],
        );
      }
    });
    return {inventoryIds, storedItemIds};
  }

  private findTargetItemForSuggestion(
    listId: string,
    suggestion: ShoppingSuggestion,
  ): ShoppingListItem | null {
    const byCatalog = db.execute(
      `
        SELECT *
        FROM shopping_list_items
        WHERE list_id = ?
          AND catalog_product_id = ?
        ORDER BY created_at ASC
        LIMIT 1
      `,
      [listId, suggestion.catalogProductId],
    );
    if (byCatalog.rows && byCatalog.rows.length > 0) {
      return mapShoppingItem(byCatalog.rows.item(0));
    }

    const byName = db.execute(
      `
        SELECT *
        FROM shopping_list_items
        WHERE list_id = ?
          AND catalog_product_id IS NULL
          AND lower(trim(label)) = ?
        ORDER BY created_at ASC
        LIMIT 1
      `,
      [listId, suggestion.normalizedName],
    );
    if (byName.rows && byName.rows.length > 0) {
      return mapShoppingItem(byName.rows.item(0));
    }
    return null;
  }
}
