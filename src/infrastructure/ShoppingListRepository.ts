import {
  CatalogProduct,
  CatalogProductKind,
  ShoppingItemSource,
  ShoppingItemStatus,
  ShoppingListIconColorKey,
  ShoppingListIconKey,
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
  iconKey?: ShoppingListIconKey;
  iconColorKey?: ShoppingListIconColorKey;
  quantity?: number;
  source?: ShoppingItemSource;
  status?: ShoppingItemStatus;
};

export type UpdateShoppingListInput = {
  name: string;
  iconKey: ShoppingListIconKey;
  iconColorKey: ShoppingListIconColorKey;
};

export type UpdateTextShoppingItemInput = {
  label: string;
  iconKey: ShoppingListIconKey;
  iconColorKey: ShoppingListIconColorKey;
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

export function getDefaultShoppingListIconKey(type: ShoppingListType): ShoppingListIconKey {
  return type === 'auto' ? 'refresh' : 'basket';
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

function mapShoppingList(row: Record<string, any>): ShoppingListSummary {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    iconKey: row.icon_key ?? getDefaultShoppingListIconKey(row.type),
    iconColorKey: row.icon_color_key ?? 'green',
    isLocked: row.is_locked === 1,
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
    linkedCatalogProducts: [],
    label: row.label,
    iconKey: row.icon_key ?? 'box',
    iconColorKey: row.icon_color_key ?? 'green',
    imageUrl: row.image_url ?? null,
    quantity: Number(row.quantity),
    sortOrder: Number(row.sort_order ?? 0),
    status: row.status,
    source: row.source,
    storedAt: row.stored_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ShoppingListRepository {
  async createList(
    name: string,
    type: ShoppingListType,
    iconKey: ShoppingListIconKey = getDefaultShoppingListIconKey(type),
    iconColorKey: ShoppingListIconColorKey = 'green',
  ): Promise<ShoppingListSummary> {
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
          icon_key,
          icon_color_key,
          is_locked,
          sort_order,
          locked_at,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, 0, ?, NULL, ?, ?)
      `,
      [id, name.trim(), type, iconKey, iconColorKey, sortOrder, timestamp, timestamp],
    );
    return {
      id,
      name: name.trim(),
      type,
      iconKey,
      iconColorKey,
      isLocked: false,
      sortOrder,
      lockedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  async getLists(): Promise<ShoppingListSummary[]> {
    const result = db.execute(
      `
        SELECT *
        FROM shopping_lists
        ORDER BY sort_order ASC, created_at ASC
      `,
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

  async updateList(
    id: string,
    input: UpdateShoppingListInput,
  ): Promise<ShoppingListSummary> {
    const name = input.name.trim();
    if (!name) {
      throw new Error('Shopping list name cannot be empty');
    }
    const timestamp = nowIso();
    db.execute(
      `
        UPDATE shopping_lists
        SET name = ?,
            icon_key = ?,
            icon_color_key = ?,
            updated_at = ?
        WHERE id = ?
      `,
      [name, input.iconKey, input.iconColorKey, timestamp, id],
    );
    const updated = await this.getListById(id);
    if (!updated) {
      throw new Error(`Shopping list not found: ${id}`);
    }
    return updated;
  }

  async deleteList(id: string): Promise<void> {
    runInTransaction(() => {
      db.execute(
        `
          DELETE FROM shopping_list_item_catalog_products
          WHERE item_id IN (
            SELECT id
            FROM shopping_list_items
            WHERE list_id = ?
          )
        `,
        [id],
      );
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
        SELECT
          item.*,
          definition.image_url
        FROM shopping_list_items item
        LEFT JOIN product_catalog catalog ON item.catalog_product_id = catalog.id
        LEFT JOIN product_definitions definition ON catalog.product_ean = definition.ean
        WHERE item.list_id = ?
        ORDER BY item.sort_order ASC, item.created_at ASC
      `,
      [listId],
    );
    const items: ShoppingListItem[] = [];
    if (result.rows) {
      for (let i = 0; i < result.rows.length; i++) {
        items.push(mapShoppingItem(result.rows.item(i)));
      }
    }
    return this.attachLinkedCatalogProducts(items);
  }

  async getCatalogProducts(): Promise<CatalogProduct[]> {
    const result = db.execute(
      `
        SELECT
          catalog.*,
          definition.image_url
        FROM product_catalog catalog
        LEFT JOIN product_definitions definition ON catalog.product_ean = definition.ean
        ORDER BY catalog.kind ASC, catalog.name ASC
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
    const orderResult = db.execute(
      'SELECT COALESCE(MAX(sort_order), -1) AS max_sort_order FROM shopping_list_items WHERE list_id = ?',
      [listId],
    );
    const sortOrder = Number(orderResult.rows?.item(0)?.max_sort_order ?? -1) + 1;
    db.execute(
      `
        INSERT INTO shopping_list_items (
          id,
          list_id,
          catalog_product_id,
          label,
          icon_key,
          icon_color_key,
          quantity,
          sort_order,
          status,
          source,
          stored_at,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
      `,
      [
        id,
        listId,
        input.catalogProductId ?? null,
        input.label.trim(),
        input.iconKey ?? 'box',
        input.iconColorKey ?? 'green',
        quantity,
        sortOrder,
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
      linkedCatalogProducts: [],
      label: input.label.trim(),
      iconKey: input.iconKey ?? 'box',
      iconColorKey: input.iconColorKey ?? 'green',
      imageUrl: null,
      quantity,
      sortOrder,
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

  async updateTextItem(id: string, input: UpdateTextShoppingItemInput): Promise<void> {
    const label = input.label.trim();
    if (!label) {
      throw new Error('Shopping list item label cannot be empty');
    }
    const itemResult = db.execute(
      'SELECT catalog_product_id FROM shopping_list_items WHERE id = ?',
      [id],
    );
    if (!itemResult.rows || itemResult.rows.length === 0) {
      throw new Error(`Shopping list item not found: ${id}`);
    }
    if (itemResult.rows.item(0).catalog_product_id != null) {
      throw new Error('Only text shopping items can be edited');
    }

    db.execute(
      `
        UPDATE shopping_list_items
        SET label = ?,
            icon_key = ?,
            icon_color_key = ?,
            updated_at = ?
        WHERE id = ?
      `,
      [label, input.iconKey, input.iconColorKey, nowIso(), id],
    );
  }

  async updateItemOrder(listId: string, itemIds: string[]): Promise<void> {
    runInTransaction(() => {
      const timestamp = nowIso();
      itemIds.forEach((id, index) => {
        db.execute(
          `
            UPDATE shopping_list_items
            SET sort_order = ?,
                updated_at = ?
            WHERE list_id = ?
              AND id = ?
          `,
          [index, timestamp, listId, id],
        );
      });
    });
  }

  async deleteItem(id: string): Promise<void> {
    runInTransaction(() => {
      db.execute('DELETE FROM shopping_list_item_catalog_products WHERE item_id = ?', [id]);
      db.execute('DELETE FROM shopping_list_items WHERE id = ?', [id]);
    });
  }

  async linkCatalogProductToItem(itemId: string, catalogProductId: string): Promise<void> {
    const itemResult = db.execute(
      'SELECT catalog_product_id FROM shopping_list_items WHERE id = ?',
      [itemId],
    );
    if (!itemResult.rows || itemResult.rows.length === 0) {
      throw new Error(`Shopping list item not found: ${itemId}`);
    }
    if (itemResult.rows.item(0).catalog_product_id != null) {
      throw new Error('Catalog links can only be added to text shopping items');
    }

    db.execute(
      `
        INSERT OR IGNORE INTO shopping_list_item_catalog_products (
          item_id,
          catalog_product_id,
          created_at
        )
        VALUES (?, ?, ?)
      `,
      [itemId, catalogProductId, nowIso()],
    );
  }

  async unlinkCatalogProductFromItem(itemId: string, catalogProductId: string): Promise<void> {
    db.execute(
      `
        DELETE FROM shopping_list_item_catalog_products
        WHERE item_id = ?
          AND catalog_product_id = ?
      `,
      [itemId, catalogProductId],
    );
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
      imageUrl: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  async findCatalogProductById(id: string): Promise<CatalogProduct | null> {
    const result = db.execute(
      `
        SELECT
          catalog.*,
          definition.image_url
        FROM product_catalog catalog
        LEFT JOIN product_definitions definition ON catalog.product_ean = definition.ean
        WHERE catalog.id = ?
      `,
      [id],
    );
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
      `
        SELECT
          catalog.*,
          definition.image_url
        FROM product_catalog catalog
        LEFT JOIN product_definitions definition ON catalog.product_ean = definition.ean
        WHERE catalog.kind = ?
          AND catalog.normalized_name = ?
      `,
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
        SELECT
          catalog.*,
          definition.image_url
        FROM product_catalog catalog
        LEFT JOIN product_definitions definition ON catalog.product_ean = definition.ean
        WHERE catalog.normalized_name LIKE ?
        ORDER BY catalog.kind ASC, catalog.name ASC
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
    const orderResult = db.execute(
      'SELECT COALESCE(MAX(sort_order), -1) AS max_sort_order FROM shopping_list_items WHERE list_id = ?',
      [targetManualListId],
    );
    let nextSortOrder = Number(orderResult.rows?.item(0)?.max_sort_order ?? -1) + 1;
    runInTransaction(() => {
      for (const suggestion of suggestions) {
        const existing = this.findTargetItemForSuggestion(targetManualListId, suggestion);
        const linkedCatalogProductIds = suggestion.linkedCatalogProductIds ?? [];
        if (!existing) {
          const timestamp = nowIso();
          const itemId = generateId('shopping-item');
          db.execute(
            `
              INSERT INTO shopping_list_items (
                id,
                list_id,
                catalog_product_id,
                label,
                icon_key,
                icon_color_key,
                quantity,
                sort_order,
                status,
                source,
                stored_at,
                created_at,
                updated_at
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'planned', 'suggestion', NULL, ?, ?)
            `,
            [
              itemId,
              targetManualListId,
              suggestion.catalogProductId,
              suggestion.name,
              suggestion.iconKey ?? 'box',
              suggestion.iconColorKey ?? 'green',
              Math.max(1, suggestion.missingQuantity),
              nextSortOrder,
              timestamp,
              timestamp,
            ],
          );
          this.insertItemCatalogLinks(itemId, linkedCatalogProductIds, timestamp);
          nextSortOrder += 1;
          summary.added += 1;
          continue;
        }

        if (existing.status === 'purchased') {
          summary.skipped += 1;
          continue;
        }

        const nextQuantity = Math.max(existing.quantity, suggestion.missingQuantity);
        const timestamp = nowIso();
        this.insertItemCatalogLinks(existing.id, linkedCatalogProductIds, timestamp);
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
            d.ean AS product_ean,
            linked.linked_product_ean
          FROM shopping_list_items i
          LEFT JOIN product_catalog c ON i.catalog_product_id = c.id
          LEFT JOIN product_definitions d ON c.product_ean = d.ean
          LEFT JOIN (
            SELECT
              link.item_id,
              CASE
                WHEN COUNT(catalog.product_ean) = 1 THEN MAX(catalog.product_ean)
                ELSE NULL
              END AS linked_product_ean
            FROM shopping_list_item_catalog_products link
            INNER JOIN product_catalog catalog ON catalog.id = link.catalog_product_id
            WHERE catalog.kind = 'specific'
              AND catalog.product_ean IS NOT NULL
            GROUP BY link.item_id
          ) linked ON linked.item_id = i.id
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
                row.product_ean ?? row.linked_product_ean ?? null,
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
    if (suggestion.catalogProductId) {
      const byCatalog = db.execute(
        `
          SELECT *
          FROM shopping_list_items
          WHERE list_id = ?
            AND catalog_product_id = ?
          ORDER BY sort_order ASC, created_at ASC
          LIMIT 1
        `,
        [listId, suggestion.catalogProductId],
      );
      if (byCatalog.rows && byCatalog.rows.length > 0) {
        return mapShoppingItem(byCatalog.rows.item(0));
      }
    }

    const byName = db.execute(
      `
        SELECT *
        FROM shopping_list_items
        WHERE list_id = ?
          AND catalog_product_id IS NULL
          AND lower(trim(label)) = ?
        ORDER BY sort_order ASC, created_at ASC
        LIMIT 1
      `,
      [listId, suggestion.normalizedName],
    );
    if (byName.rows && byName.rows.length > 0) {
      return mapShoppingItem(byName.rows.item(0));
    }
    return null;
  }

  private attachLinkedCatalogProducts(items: ShoppingListItem[]): ShoppingListItem[] {
    if (items.length === 0) {
      return items;
    }

    const itemIds = items.map(item => item.id);
    const placeholders = itemIds.map(() => '?').join(', ');
    const result = db.execute(
      `
        SELECT
          link.item_id,
          catalog.id,
          catalog.name,
          catalog.normalized_name,
          catalog.kind,
          catalog.product_ean,
          definition.image_url,
          catalog.parent_catalog_product_id,
          catalog.created_at,
          catalog.updated_at
        FROM shopping_list_item_catalog_products link
        INNER JOIN product_catalog catalog ON catalog.id = link.catalog_product_id
        LEFT JOIN product_definitions definition ON catalog.product_ean = definition.ean
        WHERE link.item_id IN (${placeholders})
        ORDER BY catalog.name ASC
      `,
      itemIds,
    );

    const linkedByItemId = new Map<string, CatalogProduct[]>();
    if (result.rows) {
      for (let i = 0; i < result.rows.length; i++) {
        const row = result.rows.item(i);
        const itemId = String(row.item_id);
        const linked = linkedByItemId.get(itemId) ?? [];
        linked.push(mapCatalogProduct(row));
        linkedByItemId.set(itemId, linked);
      }
    }

    return items.map(item => ({
      ...item,
      linkedCatalogProducts: linkedByItemId.get(item.id) ?? [],
    }));
  }

  private insertItemCatalogLinks(
    itemId: string,
    catalogProductIds: string[],
    timestamp: string,
  ): void {
    for (const catalogProductId of catalogProductIds) {
      db.execute(
        `
          INSERT OR IGNORE INTO shopping_list_item_catalog_products (
            item_id,
            catalog_product_id,
            created_at
          )
          VALUES (?, ?, ?)
        `,
        [itemId, catalogProductId, timestamp],
      );
    }
  }
}
