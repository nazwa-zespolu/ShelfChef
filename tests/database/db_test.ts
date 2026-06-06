type ProductDefinitionRow = {
  ean: string;
  name: string;
  brand: string | null;
  image_url: string | null;
  category: string | null;
};

type InventoryRow = {
  id: string;
  product_ean: string | null;
  custom_name: string | null;
  expiry_date: string | null;
  opened_at: string | null;
  is_opened: number;
};

type ProductCatalogRow = {
  id: string;
  name: string;
  normalized_name: string;
  kind: 'generic' | 'specific';
  product_ean: string | null;
  parent_catalog_product_id: string | null;
  created_at: string;
  updated_at: string;
};

type ShoppingListRow = {
  id: string;
  name: string;
  type: 'manual' | 'auto';
  icon_key: string;
  icon_color_key: string;
  is_locked: number;
  sort_order: number;
  locked_at: string | null;
  created_at: string;
  updated_at: string;
};

type ShoppingListItemRow = {
  id: string;
  list_id: string;
  catalog_product_id: string | null;
  label: string;
  icon_key: string;
  icon_color_key: string;
  quantity: number;
  sort_order: number;
  status: 'planned' | 'purchased' | 'stored';
  source: 'manual' | 'suggestion' | 'reactivated';
  stored_at: string | null;
  created_at: string;
  updated_at: string;
};

type ShoppingListItemCatalogProductRow = {
  item_id: string;
  catalog_product_id: string;
  created_at: string;
};

type SQLiteResult = {
  rows: {
    length: number;
    item: (index: number) => Record<string, unknown>;
  };
};

const productDefinitions = new Map<string, ProductDefinitionRow>();
const inventory = new Map<string, InventoryRow>();
const productCatalog = new Map<string, ProductCatalogRow>();
const shoppingLists = new Map<string, ShoppingListRow>();
const shoppingListItems = new Map<string, ShoppingListItemRow>();
const shoppingListItemCatalogProducts = new Map<string, ShoppingListItemCatalogProductRow>();

const withCatalogImage = (row: ProductCatalogRow): Record<string, unknown> => ({
  ...row,
  image_url: row.product_ean ? productDefinitions.get(row.product_ean)?.image_url ?? null : null,
});

const withShoppingItemImage = (row: ShoppingListItemRow): Record<string, unknown> => {
  const catalog = row.catalog_product_id ? productCatalog.get(row.catalog_product_id) : undefined;
  return {
    ...row,
    image_url: catalog?.product_ean ? productDefinitions.get(catalog.product_ean)?.image_url ?? null : null,
  };
};

const toRows = (data: Record<string, unknown>[]): SQLiteResult => ({
  rows: {
    length: data.length,
    item: (index: number) => data[index],
  },
});

const execute = (sql: string, params: any[] = []): SQLiteResult => {
  const normalized = sql.replace(/\s+/g, ' ').trim().toUpperCase();

  if (
    normalized.startsWith('CREATE TABLE') ||
    normalized.startsWith('CREATE UNIQUE INDEX') ||
    normalized.startsWith('CREATE INDEX') ||
    normalized === 'BEGIN TRANSACTION' ||
    normalized === 'COMMIT' ||
    normalized === 'ROLLBACK'
  ) {
    return toRows([]);
  }

  if (normalized.startsWith('DELETE FROM PRODUCT_DEFINITIONS')) {
    productDefinitions.clear();
    return toRows([]);
  }

  if (normalized.startsWith('DELETE FROM INVENTORY')) {
    inventory.clear();
    return toRows([]);
  }

  if (normalized.startsWith('DELETE FROM PRODUCT_CATALOG')) {
    productCatalog.clear();
    return toRows([]);
  }

  if (normalized.startsWith('DELETE FROM SHOPPING_LISTS')) {
    shoppingLists.clear();
    return toRows([]);
  }

  if (normalized.startsWith('DELETE FROM SHOPPING_LIST_ITEMS')) {
    if (normalized.includes('WHERE LIST_ID = ?')) {
      const [listId] = params;
      for (const [id, row] of shoppingListItems.entries()) {
        if (row.list_id === listId) {
          shoppingListItems.delete(id);
        }
      }
      return toRows([]);
    }
    shoppingListItems.clear();
    return toRows([]);
  }

  if (normalized.startsWith('DELETE FROM SHOPPING_LIST_ITEM_CATALOG_PRODUCTS')) {
    if (normalized.includes('WHERE ITEM_ID IN')) {
      const [listId] = params;
      const itemIds = new Set(
        Array.from(shoppingListItems.values())
          .filter(item => item.list_id === listId)
          .map(item => item.id),
      );
      for (const [key, row] of shoppingListItemCatalogProducts.entries()) {
        if (itemIds.has(row.item_id)) {
          shoppingListItemCatalogProducts.delete(key);
        }
      }
      return toRows([]);
    }
    if (normalized.includes('WHERE ITEM_ID = ? AND CATALOG_PRODUCT_ID = ?')) {
      const [itemId, catalogProductId] = params;
      shoppingListItemCatalogProducts.delete(`${itemId}:${catalogProductId}`);
      return toRows([]);
    }
    if (normalized.includes('WHERE ITEM_ID = ?')) {
      const [itemId] = params;
      for (const [key, row] of shoppingListItemCatalogProducts.entries()) {
        if (row.item_id === itemId) {
          shoppingListItemCatalogProducts.delete(key);
        }
      }
      return toRows([]);
    }
    shoppingListItemCatalogProducts.clear();
    return toRows([]);
  }

  if (normalized.startsWith('DELETE FROM SHOPPING_LISTS WHERE ID = ?')) {
    shoppingLists.delete(params[0]);
    return toRows([]);
  }

  if (normalized.includes('FROM PRODUCT_CATALOG CATALOG')) {
    const catalogRows = Array.from(productCatalog.values());
    if (normalized.includes('WHERE CATALOG.PRODUCT_EAN = ?')) {
      const row = catalogRows.find(item => item.product_ean === params[0]);
      return toRows(row ? [withCatalogImage(row)] : []);
    }
    if (normalized.includes('WHERE CATALOG.ID = ?')) {
      const row = productCatalog.get(params[0]);
      return toRows(row ? [withCatalogImage(row)] : []);
    }
    if (normalized.includes('WHERE CATALOG.KIND = ?') && normalized.includes('CATALOG.NORMALIZED_NAME = ?')) {
      const [kind, normalizedName] = params;
      const row = catalogRows.find(
        item => item.kind === kind && item.normalized_name === normalizedName,
      );
      return toRows(row ? [withCatalogImage(row)] : []);
    }
    if (normalized.includes('WHERE CATALOG.NORMALIZED_NAME LIKE ?')) {
      const query = String(params[0]).split('%').join('');
      return toRows(
        catalogRows
          .filter(item => item.normalized_name.includes(query))
          .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))
          .slice(0, 20)
          .map(withCatalogImage),
      );
    }
    return toRows(
      catalogRows
        .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))
        .map(withCatalogImage),
    );
  }

  if (normalized.startsWith('SELECT * FROM PRODUCT_CATALOG')) {
    if (normalized.includes('WHERE PRODUCT_EAN = ?')) {
      const row = Array.from(productCatalog.values()).find(item => item.product_ean === params[0]);
      return toRows(row ? [withCatalogImage(row)] : []);
    }
    if (normalized.includes('WHERE KIND = ? AND NORMALIZED_NAME = ?')) {
      const [kind, normalizedName] = params;
      const row = Array.from(productCatalog.values()).find(
        item => item.kind === kind && item.normalized_name === normalizedName,
      );
      return toRows(row ? [withCatalogImage(row)] : []);
    }
    return toRows(Array.from(productCatalog.values()).map(withCatalogImage));
  }

  if (normalized.startsWith('SELECT * FROM SHOPPING_LISTS')) {
    if (normalized.includes('WHERE ID = ?')) {
      const row = shoppingLists.get(params[0]);
      return toRows(row ? [row] : []);
    }
    return toRows(
      Array.from(shoppingLists.values())
        .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)),
    );
  }

  if (normalized.includes('FROM SHOPPING_LIST_ITEMS ITEM')) {
    const [listId] = params;
    return toRows(
      Array.from(shoppingListItems.values())
        .filter(item => item.list_id === listId)
        .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
        .map(withShoppingItemImage),
    );
  }

  if (normalized.startsWith('SELECT * FROM SHOPPING_LIST_ITEMS')) {
    if (normalized.includes('WHERE LIST_ID = ? AND CATALOG_PRODUCT_ID = ?')) {
      const [listId, catalogProductId] = params;
      const row = Array.from(shoppingListItems.values())
        .filter(item => item.list_id === listId && item.catalog_product_id === catalogProductId)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
      return toRows(row ? [withShoppingItemImage(row)] : []);
    }
    if (
      normalized.includes('WHERE LIST_ID = ? AND CATALOG_PRODUCT_ID IS NULL AND LOWER(TRIM(LABEL)) = ?')
    ) {
      const [listId, normalizedLabel] = params;
      const row = Array.from(shoppingListItems.values())
        .filter(
          item =>
            item.list_id === listId &&
            item.catalog_product_id == null &&
            item.label.trim().toLowerCase() === normalizedLabel,
        )
        .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
      return toRows(row ? [withShoppingItemImage(row)] : []);
    }
    if (normalized.includes('WHERE LIST_ID = ?')) {
      const [listId] = params;
      return toRows(
        Array.from(shoppingListItems.values())
          .filter(item => item.list_id === listId)
          .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
          .map(withShoppingItemImage),
      );
    }
    return toRows(Array.from(shoppingListItems.values()).map(withShoppingItemImage));
  }

  if (normalized.startsWith('SELECT CATALOG_PRODUCT_ID FROM SHOPPING_LIST_ITEMS WHERE ID = ?')) {
    const [id] = params;
    const row = shoppingListItems.get(id);
    return toRows(row ? [{catalog_product_id: row.catalog_product_id}] : []);
  }

  if (normalized.startsWith('SELECT LINK.ITEM_ID')) {
    const itemIds = new Set(params);
    const rows: Record<string, unknown>[] = [];
    for (const link of shoppingListItemCatalogProducts.values()) {
      if (!itemIds.has(link.item_id)) {
        continue;
      }
      const catalog = productCatalog.get(link.catalog_product_id);
      if (catalog) {
        rows.push({item_id: link.item_id, ...withCatalogImage(catalog)});
      }
    }
    rows.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return toRows(rows);
  }

  if (normalized.startsWith('SELECT * FROM PRODUCT_DEFINITIONS WHERE EAN = ?')) {
    const ean = params[0];
    const row = productDefinitions.get(ean);
    return toRows(row ? [row] : []);
  }

  if (
    normalized.startsWith(
      'INSERT OR REPLACE INTO PRODUCT_DEFINITIONS (EAN, NAME, BRAND, IMAGE_URL, CATEGORY) VALUES (?, ?, ?, ?, ?)',
    )
  ) {
    const [ean, name, brand, imageUrl, category] = params;
    productDefinitions.set(ean, {
      ean,
      name,
      brand: brand ?? null,
      image_url: imageUrl ?? null,
      category: category ?? null,
    });
    return toRows([]);
  }

  if (normalized.startsWith('INSERT OR REPLACE INTO PRODUCT_CATALOG')) {
    const [, fallbackId, name, normalizedName, ean] = params;
    const existing = Array.from(productCatalog.values()).find(item => item.product_ean === ean);
    productCatalog.set(existing?.id ?? fallbackId, {
      id: existing?.id ?? fallbackId,
      name,
      normalized_name: normalizedName,
      kind: 'specific',
      product_ean: ean,
      parent_catalog_product_id: existing?.parent_catalog_product_id ?? null,
      created_at: existing?.created_at ?? '2026-05-27T00:00:00.000Z',
      updated_at: '2026-05-27T00:00:00.000Z',
    });
    return toRows([]);
  }

  if (normalized.startsWith('INSERT OR IGNORE INTO PRODUCT_DEFINITIONS')) {
    // Sample seed SQL is intentionally ignored by this lightweight mock.
    return toRows([]);
  }

  if (normalized.startsWith('INSERT OR IGNORE INTO INVENTORY')) {
    // Sample seed SQL is intentionally ignored by this lightweight mock.
    return toRows([]);
  }

  if (normalized.startsWith('INSERT OR IGNORE INTO PRODUCT_CATALOG')) {
    if (normalized.includes("'GENERIC'")) {
      const [id, name, normalizedName, createdAt, updatedAt] = params;
      const exists = Array.from(productCatalog.values()).some(
        item => item.kind === 'generic' && item.normalized_name === normalizedName,
      );
      if (!exists) {
        productCatalog.set(id, {
          id,
          name,
          normalized_name: normalizedName,
          kind: 'generic',
          product_ean: null,
          parent_catalog_product_id: null,
          created_at: createdAt,
          updated_at: updatedAt,
        });
      }
      return toRows([]);
    }

    for (const row of productDefinitions.values()) {
      const id = `catalog-specific-${row.ean}`;
      const eanAlreadyExists = Array.from(productCatalog.values()).some(
        item => item.product_ean === row.ean,
      );
      if (!productCatalog.has(id) && !eanAlreadyExists) {
        productCatalog.set(id, {
          id,
          name: row.name,
          normalized_name: row.name.trim().toLowerCase(),
          kind: 'specific',
          product_ean: row.ean,
          parent_catalog_product_id: null,
          created_at: '2026-05-27T00:00:00.000Z',
          updated_at: '2026-05-27T00:00:00.000Z',
        });
      }
    }
    return toRows([]);
  }

  if (normalized.startsWith('SELECT COALESCE(MAX(SORT_ORDER), -1) AS MAX_SORT_ORDER')) {
    if (normalized.includes('FROM SHOPPING_LIST_ITEMS')) {
      const [listId] = params;
      const maxSortOrder = Array.from(shoppingListItems.values())
        .filter(row => row.list_id === listId)
        .reduce((max, row) => Math.max(max, row.sort_order), -1);
      return toRows([{max_sort_order: maxSortOrder}]);
    }
    const maxSortOrder = Array.from(shoppingLists.values()).reduce(
      (max, row) => Math.max(max, row.sort_order),
      -1,
    );
    return toRows([{max_sort_order: maxSortOrder}]);
  }

  if (normalized.startsWith('INSERT INTO SHOPPING_LISTS')) {
    const [id, name, type, iconKey, iconColorKey, sortOrder, createdAt, updatedAt] = params;
    shoppingLists.set(id, {
      id,
      name,
      type,
      icon_key: iconKey,
      icon_color_key: iconColorKey,
      is_locked: 0,
      sort_order: sortOrder,
      locked_at: null,
      created_at: createdAt,
      updated_at: updatedAt,
    });
    return toRows([]);
  }

  if (normalized.startsWith('UPDATE SHOPPING_LISTS SET ICON_KEY =')) {
    for (const row of shoppingLists.values()) {
      if (row.type === 'auto') {
        row.icon_key = 'refresh';
      }
    }
    return toRows([]);
  }

  if (normalized.startsWith('UPDATE SHOPPING_LISTS SET SORT_ORDER = ?')) {
    const [sortOrder, updatedAt, id] = params;
    const row = shoppingLists.get(id);
    if (row) {
      row.sort_order = sortOrder;
      row.updated_at = updatedAt;
      shoppingLists.set(id, row);
    }
    return toRows([]);
  }

  if (normalized.startsWith('UPDATE SHOPPING_LISTS SET NAME = ?')) {
    const [name, iconKey, iconColorKey, updatedAt, id] = params;
    const row = shoppingLists.get(id);
    if (row) {
      row.name = name;
      row.icon_key = iconKey;
      row.icon_color_key = iconColorKey;
      row.updated_at = updatedAt;
      shoppingLists.set(id, row);
    }
    return toRows([]);
  }

  if (normalized.startsWith('INSERT INTO SHOPPING_LIST_ITEMS')) {
    const [id, listId, catalogProductId, label] = params;
    const hasExplicitStatus = params.length >= 12;
    const isSuggestionInsert = normalized.includes("'PLANNED', 'SUGGESTION'");
    const iconKey = hasExplicitStatus || isSuggestionInsert ? params[4] : 'box';
    const iconColorKey = hasExplicitStatus || isSuggestionInsert ? params[5] : 'green';
    const quantity = hasExplicitStatus || isSuggestionInsert ? params[6] : params[4];
    const sortOrder = hasExplicitStatus || isSuggestionInsert ? params[7] : params[5];
    shoppingListItems.set(id, {
      id,
      list_id: listId,
      catalog_product_id: catalogProductId ?? null,
      label,
      icon_key: iconKey,
      icon_color_key: iconColorKey,
      quantity,
      sort_order: sortOrder,
      status: hasExplicitStatus ? params[8] : 'planned',
      source: hasExplicitStatus ? params[9] : 'suggestion',
      stored_at: null,
      created_at: hasExplicitStatus ? params[10] : isSuggestionInsert ? params[8] : params[6],
      updated_at: hasExplicitStatus ? params[11] : isSuggestionInsert ? params[9] : params[7],
    });
    return toRows([]);
  }

  if (normalized.startsWith('INSERT OR IGNORE INTO SHOPPING_LIST_ITEM_CATALOG_PRODUCTS')) {
    const [itemId, catalogProductId, createdAt] = params;
    const key = `${itemId}:${catalogProductId}`;
    if (!shoppingListItemCatalogProducts.has(key)) {
      shoppingListItemCatalogProducts.set(key, {
        item_id: itemId,
        catalog_product_id: catalogProductId,
        created_at: createdAt,
      });
    }
    return toRows([]);
  }

  if (normalized.startsWith('UPDATE SHOPPING_LIST_ITEMS SET SORT_ORDER = ?')) {
    const [sortOrder, updatedAt, listId, id] = params;
    const row = shoppingListItems.get(id);
    if (row && row.list_id === listId) {
      row.sort_order = sortOrder;
      row.updated_at = updatedAt;
      shoppingListItems.set(id, row);
    }
    return toRows([]);
  }

  if (normalized.startsWith('UPDATE SHOPPING_LIST_ITEMS SET QUANTITY = ?')) {
    const [quantity, updatedAt, id] = params;
    const row = shoppingListItems.get(id);
    if (row) {
      row.quantity = quantity;
      row.updated_at = updatedAt;
      shoppingListItems.set(id, row);
    }
    return toRows([]);
  }

  if (normalized.startsWith('UPDATE SHOPPING_LIST_ITEMS SET LABEL = ?')) {
    const [label, iconKey, iconColorKey, updatedAt, id] = params;
    const row = shoppingListItems.get(id);
    if (row) {
      row.label = label;
      row.icon_key = iconKey;
      row.icon_color_key = iconColorKey;
      row.updated_at = updatedAt;
      shoppingListItems.set(id, row);
    }
    return toRows([]);
  }

  if (normalized.startsWith('UPDATE SHOPPING_LIST_ITEMS SET STATUS = ?')) {
    const [status, , storedAt, updatedAt, id] = params;
    const row = shoppingListItems.get(id);
    if (row) {
      row.status = status;
      if (status === 'stored') {
        row.stored_at = row.stored_at ?? storedAt;
      }
      row.updated_at = updatedAt;
      shoppingListItems.set(id, row);
    }
    return toRows([]);
  }

  if (normalized.startsWith('UPDATE SHOPPING_LIST_ITEMS SET STATUS = \'PLANNED\', QUANTITY = ?')) {
    const [quantity, updatedAt, id] = params;
    const row = shoppingListItems.get(id);
    if (row) {
      row.status = 'planned';
      row.quantity = quantity;
      row.source = 'reactivated';
      row.stored_at = null;
      row.updated_at = updatedAt;
      shoppingListItems.set(id, row);
    }
    return toRows([]);
  }

  if (normalized.startsWith('SELECT I.ID, I.LABEL, I.QUANTITY')) {
    const [listId] = params;
    const rows = Array.from(shoppingListItems.values())
      .filter(item => item.list_id === listId && item.status === 'purchased')
      .map(item => {
        const catalog = item.catalog_product_id
          ? productCatalog.get(item.catalog_product_id)
          : undefined;
        const definition = catalog?.product_ean
          ? productDefinitions.get(catalog.product_ean)
          : undefined;
        const linkedSpecificEans = Array.from(shoppingListItemCatalogProducts.values())
          .filter(link => link.item_id === item.id)
          .map(link => productCatalog.get(link.catalog_product_id)?.product_ean ?? null)
          .filter((ean): ean is string => ean != null);
        return {
          id: item.id,
          label: item.label,
          quantity: item.quantity,
          catalog_product_id: item.catalog_product_id,
          product_ean: definition?.ean ?? null,
          linked_product_ean: linkedSpecificEans.length === 1 ? linkedSpecificEans[0] : null,
        };
      });
    return toRows(rows);
  }

  if (normalized.startsWith('UPDATE SHOPPING_LIST_ITEMS SET STATUS = \'STORED\'')) {
    const [storedAt, updatedAt, id] = params;
    const row = shoppingListItems.get(id);
    if (row) {
      row.status = 'stored';
      row.stored_at = storedAt;
      row.updated_at = updatedAt;
      shoppingListItems.set(id, row);
    }
    return toRows([]);
  }

  if (normalized.startsWith('SELECT TYPE FROM SHOPPING_LISTS WHERE ID = ?')) {
    const [id] = params;
    const row = shoppingLists.get(id);
    return toRows(row ? [{type: row.type}] : []);
  }

  if (normalized.startsWith('UPDATE SHOPPING_LIST_ITEMS SET STATUS = \'PLANNED\'')) {
    const [updatedAt, listId] = params;
    for (const row of shoppingListItems.values()) {
      if (row.list_id === listId) {
        row.status = 'planned';
        row.stored_at = null;
        row.updated_at = updatedAt;
      }
    }
    return toRows([]);
  }

  if (normalized.startsWith('INSERT OR IGNORE INTO SHOPPING_LISTS')) {
    if (!shoppingLists.has('default-auto-minimum')) {
      shoppingLists.set('default-auto-minimum', {
        id: 'default-auto-minimum',
        name: 'Moje minimum',
        type: 'auto',
        icon_key: 'refresh',
        icon_color_key: 'green',
        is_locked: 0,
        sort_order: 0,
        locked_at: null,
        created_at: '2026-05-27T00:00:00.000Z',
        updated_at: '2026-05-27T00:00:00.000Z',
      });
    }
    return toRows([]);
  }

  if (
    normalized.startsWith(
      'INSERT INTO INVENTORY (ID, PRODUCT_EAN, CUSTOM_NAME, EXPIRY_DATE) VALUES (?, ?, ?, ?)',
    )
  ) {
    const [id, productEan, customName, expiryDate] = params;
    inventory.set(id, {
      id,
      product_ean: productEan ?? null,
      custom_name: customName ?? null,
      expiry_date: expiryDate,
      opened_at: null,
      is_opened: 0,
    });
    return toRows([]);
  }

  if (
    normalized.startsWith('SELECT I.ID, I.EXPIRY_DATE, I.OPENED_AT, I.IS_OPENED, I.CUSTOM_NAME')
  ) {
    const rows = Array.from(inventory.values())
      .map(row => {
        const def = row.product_ean ? productDefinitions.get(row.product_ean) : undefined;
        return {
          id: row.id,
          expiry_date: row.expiry_date,
          opened_at: row.opened_at,
          is_opened: row.is_opened,
          custom_name: row.custom_name,
          ean: def?.ean ?? row.product_ean,
          name: def?.name ?? null,
          brand: def?.brand ?? null,
          image_url: def?.image_url ?? null,
          category: def?.category ?? null,
        };
      })
      .sort((a, b) => {
        if (a.expiry_date == null && b.expiry_date == null) {
          return 0;
        }
        if (a.expiry_date == null) {
          return 1;
        }
        if (b.expiry_date == null) {
          return -1;
        }
        return a.expiry_date.localeCompare(b.expiry_date);
      });

    return toRows(rows);
  }

  if (normalized.startsWith('UPDATE INVENTORY SET IS_OPENED = 1, OPENED_AT = ? WHERE ID = ?')) {
    const [date, id] = params;
    const row = inventory.get(id);
    if (row) {
      row.is_opened = 1;
      row.opened_at = date;
      inventory.set(id, row);
    }
    return toRows([]);
  }

  if (normalized.startsWith('DELETE FROM INVENTORY WHERE ID = ?')) {
    const [id] = params;
    inventory.delete(id);
    return toRows([]);
  }

  throw new Error(`Unsupported SQL in test mock: ${sql}`);
};

jest.mock('react-native-quick-sqlite', () => ({
  open: () => ({
    execute,
  }),
}), { virtual: true });

import { setupDatabase, db } from '../../src/infrastructure/db/init';
import { ProductRepository } from '../../src/infrastructure/ProductRepository';
import { ShoppingListRepository } from '../../src/infrastructure/ShoppingListRepository';
import { ShoppingList } from '../../src/app/ShoppingList';
import { InventoryItem, ProductDefinition } from '../../src/domain/types';

describe('ProductRepository + database integration', () => {
  let repository: ProductRepository;
  let shoppingListRepository: ShoppingListRepository;

  beforeEach(() => {
    db.execute('DELETE FROM inventory');
    db.execute('DELETE FROM product_definitions');
    db.execute('DELETE FROM product_catalog');
    db.execute('DELETE FROM shopping_lists');
    db.execute('DELETE FROM shopping_list_item_catalog_products');
    db.execute('DELETE FROM shopping_list_items');
    setupDatabase();
    repository = new ProductRepository();
    shoppingListRepository = new ShoppingListRepository();
  });

  it('zapisuje i odczytuje definicje produktu po EAN', async () => {
    const definition: ProductDefinition = {
      ean: '5901234123457',
      name: 'Mleko 2%',
      brand: 'Lacpol',
      imageUrl: 'https://img/mleko.jpg',
      category: 'Nabial',
    };

    await repository.saveDefinition(definition);

    const found = await repository.findDefinitionByEan('5901234123457');

    expect(found).toEqual(definition);
  });

  it('synchronizuje zapisaną definicję produktu z katalogiem specific', async () => {
    await repository.saveDefinition({
      ean: '5901234123457',
      name: 'Mleko 2%',
      brand: 'Lacpol',
      imageUrl: 'https://img/mleko.jpg',
      category: 'Nabial',
    });

    const catalog = db.execute('SELECT * FROM product_catalog WHERE product_ean = ?', [
      '5901234123457',
    ]).rows!;

    expect(catalog.length).toBe(1);
    expect(catalog.item(0)).toMatchObject({
      id: 'catalog-specific-5901234123457',
      name: 'Mleko 2%',
      normalized_name: 'mleko 2%',
      kind: 'specific',
      product_ean: '5901234123457',
      parent_catalog_product_id: null,
    });
    await expect(repository.findCatalogProductByEan('5901234123457')).resolves.toMatchObject({
      imageUrl: 'https://img/mleko.jpg',
    });
  });

  it('zwraca null, gdy brak definicji dla EAN', async () => {
    const found = await repository.findDefinitionByEan('9999999999999');
    expect(found).toBeNull();
  });

  it('zwraca inventory posortowane po dacie i z fallbackiem custom_name', async () => {
    const yogurtDefinition: ProductDefinition = {
      ean: '111',
      name: 'Jogurt',
      brand: 'Mlekovita',
      imageUrl: undefined,
      category: 'Nabial',
    };

    await repository.saveDefinition(yogurtDefinition);

    await repository.addToInventory('inv-late', '111', null, '2026-12-31');
    await repository.addToInventory('inv-early', null, 'Domowy sos', '2026-05-10');

    const items: InventoryItem[] = await repository.getFullInventory();

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: 'inv-early',
      ean: '',
      name: 'Domowy sos',
      isOpened: false,
    });
    expect(items[1]).toMatchObject({
      id: 'inv-late',
      ean: '111',
      name: 'Jogurt',
      brand: 'Mlekovita',
      category: 'Nabial',
      isOpened: false,
    });
  });

  it('oznacza produkt jako otwarty i zapisuje openedAt', async () => {
    await repository.addToInventory('inv-open', null, 'Pesto', '2026-08-01');
    await repository.markAsOpened('inv-open', '2026-04-16T08:30:00.000Z');

    const items: InventoryItem[] = await repository.getFullInventory();

    expect(items[0]).toMatchObject({
      id: 'inv-open',
      isOpened: true,
      openedAt: '2026-04-16T08:30:00.000Z',
    });
  });

  it('usuwa element z inventory', async () => {
    await repository.addToInventory('inv-remove', null, 'Keczup', '2026-09-01');
    await repository.removeFromInventory('inv-remove');

    const items: InventoryItem[] = await repository.getFullInventory();
    expect(items).toHaveLength(0);
  });

  it('zapisuje null jako brak daty ważności', async () => {
    await repository.addToInventory('inv-no-expiry', null, 'Sól', null);

    const items: InventoryItem[] = await repository.getFullInventory();

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'inv-no-expiry',
      name: 'Sól',
      expiryDate: null,
    });
  });

  it('inicjalizuje schemat list zakupów i tworzy domyślną listę automatyczną', () => {
    const lists = db.execute('SELECT * FROM shopping_lists').rows!;

    expect(lists.length).toBe(1);
    expect(lists.item(0)).toMatchObject({
      id: 'default-auto-minimum',
      name: 'Moje minimum',
      type: 'auto',
      icon_key: 'refresh',
      icon_color_key: 'green',
      is_locked: 0,
    });
  });

  it('backfilluje katalog produktów z istniejących definicji bez parenta', () => {
    db.execute('DELETE FROM inventory');
    db.execute('DELETE FROM product_definitions');
    db.execute('DELETE FROM product_catalog');
    db.execute('DELETE FROM shopping_lists');
    db.execute('DELETE FROM shopping_list_item_catalog_products');
    db.execute(
      'INSERT OR REPLACE INTO product_definitions (ean, name, brand, image_url, category) VALUES (?, ?, ?, ?, ?)',
      ['5901234123457', 'Mleko 2%', 'Lacpol', null, 'Nabial'],
    );

    setupDatabase();

    const catalog = db.execute('SELECT * FROM product_catalog').rows!;

    expect(catalog.length).toBe(1);
    expect(catalog.item(0)).toMatchObject({
      id: 'catalog-specific-5901234123457',
      name: 'Mleko 2%',
      normalized_name: 'mleko 2%',
      kind: 'specific',
      product_ean: '5901234123457',
      parent_catalog_product_id: null,
    });
  });

  it('tworzy listy zakupów z ikoną i kolorem oraz dodaje tekstową pozycję do listy manual', async () => {
    const list = await shoppingListRepository.createList('Cotygodniowe', 'manual', 'cart', 'blue');
    const item = await shoppingListRepository.addItem(list.id, {
      label: 'Mleko',
      quantity: 2,
    });
    const bread = await shoppingListRepository.addItem(list.id, {
      label: 'Chleb',
      quantity: 1,
    });
    await shoppingListRepository.updateItemOrder(list.id, [bread.id, item.id]);

    const lists = await shoppingListRepository.getLists();
    const items = await shoppingListRepository.getItems(list.id);

    expect(lists.map(l => l.name)).toContain('Cotygodniowe');
    expect(lists.find(l => l.id === list.id)?.iconKey).toBe('cart');
    expect(lists.find(l => l.id === list.id)?.iconColorKey).toBe('blue');
    expect(item).toMatchObject({
      listId: list.id,
      catalogProductId: null,
      label: 'Mleko',
      quantity: 2,
      status: 'planned',
      source: 'manual',
    });
    expect(items.map(i => i.label)).toEqual(['Chleb', 'Mleko']);
  });

  it('edytuje nazwę, ikonę i kolor listy bez zmiany typu', async () => {
    const list = await shoppingListRepository.createList('Cotygodniowe', 'manual', 'cart', 'blue');

    const updated = await shoppingListRepository.updateList(list.id, {
      name: 'Zakupy weekendowe',
      iconKey: 'basket',
      iconColorKey: 'amber',
    });
    const stored = await shoppingListRepository.getListById(list.id);

    expect(updated).toMatchObject({
      id: list.id,
      name: 'Zakupy weekendowe',
      type: 'manual',
      iconKey: 'basket',
      iconColorKey: 'amber',
    });
    expect(stored).toMatchObject(updated);
  });

  it('edytuje tekstową pozycję bez zmiany jej ilości, statusu i powiązań', async () => {
    await repository.saveDefinition({
      ean: '5901234123457',
      name: 'Mleko 2%',
      brand: 'Lacpol',
      imageUrl: undefined,
      category: 'Nabial',
    });
    const catalog = db.execute('SELECT * FROM product_catalog WHERE product_ean = ?', [
      '5901234123457',
    ]).rows!.item(0);
    const list = await shoppingListRepository.createList('Cotygodniowe', 'manual');
    const item = await shoppingListRepository.addItem(list.id, {
      label: 'Mleko',
      iconKey: 'box',
      iconColorKey: 'green',
      quantity: 2,
      status: 'purchased',
    });
    await shoppingListRepository.linkCatalogProductToItem(item.id, catalog.id as string);

    await shoppingListRepository.updateTextItem(item.id, {
      label: '  Mleko do kawy  ',
      iconKey: 'bottle',
      iconColorKey: 'blue',
    });

    const updated = (await shoppingListRepository.getItems(list.id))[0];
    expect(updated).toMatchObject({
      id: item.id,
      listId: list.id,
      catalogProductId: null,
      label: 'Mleko do kawy',
      iconKey: 'bottle',
      iconColorKey: 'blue',
      quantity: 2,
      status: 'purchased',
      source: 'manual',
      sortOrder: item.sortOrder,
    });
    expect(updated.linkedCatalogProducts.map(product => product.id)).toEqual([catalog.id]);
  });

  it('nie pozwala edytować pustej ani katalogowej pozycji jako tekstowej', async () => {
    await repository.saveDefinition({
      ean: '5901234123457',
      name: 'Mleko 2%',
      brand: 'Lacpol',
      imageUrl: undefined,
      category: 'Nabial',
    });
    const catalog = db.execute('SELECT * FROM product_catalog WHERE product_ean = ?', [
      '5901234123457',
    ]).rows!.item(0);
    const list = await shoppingListRepository.createList('Cotygodniowe', 'manual');
    const textItem = await shoppingListRepository.addItem(list.id, {label: 'Mleko'});
    const catalogItem = await shoppingListRepository.addItem(list.id, {
      catalogProductId: catalog.id as string,
      label: 'Mleko 2%',
    });

    await expect(
      shoppingListRepository.updateTextItem(textItem.id, {
        label: ' ',
        iconKey: 'box',
        iconColorKey: 'green',
      }),
    ).rejects.toThrow('Shopping list item label cannot be empty');
    await expect(
      shoppingListRepository.updateTextItem(catalogItem.id, {
        label: 'Inna nazwa',
        iconKey: 'box',
        iconColorKey: 'green',
      }),
    ).rejects.toThrow('Only text shopping items can be edited');
  });

  it('zapisuje powiązania pozycji listy z produktami katalogowymi', async () => {
    await repository.saveDefinition({
      ean: '5901234123457',
      name: 'Mleko 2%',
      brand: 'Lacpol',
      imageUrl: 'https://img/mleko.jpg',
      category: 'Nabial',
    });
    const catalog = db.execute('SELECT * FROM product_catalog WHERE product_ean = ?', [
      '5901234123457',
    ]).rows!.item(0);
    const list = await shoppingListRepository.createList('Minimum', 'auto');
    const item = await shoppingListRepository.addItem(list.id, {
      label: 'Mleko',
      quantity: 1,
    });

    await shoppingListRepository.linkCatalogProductToItem(item.id, catalog.id as string);
    const linkedItems = await shoppingListRepository.getItems(list.id);

    expect(linkedItems[0].linkedCatalogProducts).toHaveLength(1);
    expect(linkedItems[0].linkedCatalogProducts[0]).toMatchObject({
      id: 'catalog-specific-5901234123457',
      name: 'Mleko 2%',
      kind: 'specific',
      imageUrl: 'https://img/mleko.jpg',
    });
    expect(linkedItems[0].linkedCatalogProducts[0].imageUrl).toBe('https://img/mleko.jpg');

    await shoppingListRepository.unlinkCatalogProductFromItem(item.id, catalog.id as string);
    const unlinkedItems = await shoppingListRepository.getItems(list.id);

    expect(unlinkedItems[0].linkedCatalogProducts).toHaveLength(0);
  });

  it('nie pozwala podpinać katalogu do pozycji, która już jest katalogowa', async () => {
    await repository.saveDefinition({
      ean: '5901234123457',
      name: 'Mleko 2%',
      brand: 'Lacpol',
      imageUrl: undefined,
      category: 'Nabial',
    });
    const catalog = db.execute('SELECT * FROM product_catalog WHERE product_ean = ?', [
      '5901234123457',
    ]).rows!.item(0);
    const list = await shoppingListRepository.createList('Minimum', 'auto');
    const item = await shoppingListRepository.addItem(list.id, {
      catalogProductId: catalog.id as string,
      label: 'Mleko 2%',
      quantity: 1,
    });

    await expect(
      shoppingListRepository.linkCatalogProductToItem(item.id, catalog.id as string),
    ).rejects.toThrow('Catalog links can only be added to text shopping items');
  });

  it('zapisuje kolejność list i usuwa listę razem z jej pozycjami', async () => {
    const first = await shoppingListRepository.createList('Pierwsza', 'manual');
    const second = await shoppingListRepository.createList('Druga', 'manual');
    await shoppingListRepository.addItem(second.id, {
      label: 'Mleko',
      quantity: 1,
    });

    await shoppingListRepository.updateListOrder([second.id, first.id, 'default-auto-minimum']);
    let lists = await shoppingListRepository.getLists();
    expect(lists.map(list => list.id).slice(0, 2)).toEqual([second.id, first.id]);

    await shoppingListRepository.deleteList(second.id);
    lists = await shoppingListRepository.getLists();

    expect(lists.map(list => list.id)).not.toContain(second.id);
    expect(await shoppingListRepository.getItems(second.id)).toHaveLength(0);
  });

  it('pozwala dodać tekstową pozycję do listy auto jako ręczny item', async () => {
    const list = await shoppingListRepository.createList('Moje minimum 2', 'auto');

    const item = await shoppingListRepository.addItem(list.id, {
      label: 'Coś na deser',
    });

    expect(item).toMatchObject({
      listId: list.id,
      catalogProductId: null,
      label: 'Coś na deser',
      status: 'planned',
      source: 'manual',
    });
  });

  it('generuje sugestie z listy auto i merguje je z listą manual', async () => {
    const definitions = [
      {ean: '111', name: 'Mleko'},
      {ean: '222', name: 'Chleb'},
      {ean: '333', name: 'Ser'},
      {ean: '444', name: 'Masło'},
      {ean: '555', name: 'Jogurt'},
    ];
    for (const definition of definitions) {
      await repository.saveDefinition({
        ...definition,
        brand: undefined,
        imageUrl: undefined,
        category: undefined,
      });
    }

    const catalogByEan = (ean: string) =>
      db.execute('SELECT * FROM product_catalog WHERE product_ean = ?', [ean]).rows!.item(0);

    const milk = catalogByEan('111');
    const bread = catalogByEan('222');
    const cheese = catalogByEan('333');
    const butter = catalogByEan('444');
    const yogurt = catalogByEan('555');
    const auto = await shoppingListRepository.createList('Moje minimum', 'auto');
    const manual = await shoppingListRepository.createList('Cotygodniowe', 'manual');

    await shoppingListRepository.addItem(auto.id, {
      catalogProductId: milk.id as string,
      label: 'Mleko',
      quantity: 3,
    });
    await shoppingListRepository.addItem(auto.id, {
      catalogProductId: bread.id as string,
      label: 'Chleb',
      quantity: 2,
    });
    await shoppingListRepository.addItem(auto.id, {
      catalogProductId: cheese.id as string,
      label: 'Ser',
      quantity: 2,
    });
    await shoppingListRepository.addItem(auto.id, {
      catalogProductId: butter.id as string,
      label: 'Masło',
      quantity: 2,
    });
    await shoppingListRepository.addItem(auto.id, {
      catalogProductId: yogurt.id as string,
      label: 'Jogurt',
      quantity: 4,
    });

    await shoppingListRepository.addItem(manual.id, {
      catalogProductId: milk.id as string,
      label: 'Mleko',
      quantity: 1,
      status: 'planned',
    });
    await shoppingListRepository.addItem(manual.id, {
      catalogProductId: bread.id as string,
      label: 'Chleb',
      quantity: 1,
      status: 'stored',
    });
    await shoppingListRepository.addItem(manual.id, {
      catalogProductId: cheese.id as string,
      label: 'Ser',
      quantity: 1,
      status: 'stored',
    });
    await shoppingListRepository.addItem(manual.id, {
      catalogProductId: butter.id as string,
      label: 'Masło',
      quantity: 1,
      status: 'purchased',
    });
    await repository.addToInventory('inv-milk-1', '111', null, '2999-01-01');

    const shoppingList = new ShoppingList(shoppingListRepository, repository);
    const suggestions = await shoppingList.generateReplenishmentSuggestions();
    const result = await shoppingList.addAllSuggestionsToList(manual.id);
    const suggestionsByName = new Map(suggestions.map(suggestion => [suggestion.name, suggestion]));

    const itemsByLabel = new Map(
      (await shoppingListRepository.getItems(manual.id)).map(item => [item.label, item]),
    );

    expect(suggestions).toHaveLength(5);
    expect(suggestionsByName.get('Mleko')).toMatchObject({
      catalogProductId: milk.id,
      currentQuantity: 1,
      missingQuantity: 2,
      targetQuantity: 3,
      reason: 'Masz 1 z 3',
      sourceAutoListIds: [auto.id],
    });
    expect(suggestionsByName.get('Jogurt')).toMatchObject({
      catalogProductId: yogurt.id,
      currentQuantity: 0,
      missingQuantity: 4,
      targetQuantity: 4,
    });
    expect(result).toEqual({added: 1, reactivated: 2, skipped: 2});
    expect(itemsByLabel.get('Mleko')).toMatchObject({quantity: 2, status: 'planned'});
    expect(itemsByLabel.get('Chleb')).toMatchObject({
      quantity: 2,
      status: 'planned',
      source: 'reactivated',
      storedAt: null,
    });
    expect(itemsByLabel.get('Ser')).toMatchObject({
      quantity: 2,
      status: 'planned',
      source: 'reactivated',
    });
    expect(itemsByLabel.get('Masło')).toMatchObject({quantity: 1, status: 'purchased'});
    expect(itemsByLabel.get('Jogurt')).toMatchObject({
      catalogProductId: yogurt.id,
      quantity: 4,
      status: 'planned',
      source: 'suggestion',
    });
  });

  it('odrzuca merge sugestii do listy auto', async () => {
    const auto = await shoppingListRepository.createList('Moje minimum 2', 'auto');

    await expect(
      shoppingListRepository.addAllSuggestionsToManualList(auto.id, []),
    ).rejects.toThrow('Suggestions can only be added to manual lists');
  });

  it('finalizuje kupione pozycje i dodaje wiele sztuk jako osobne rekordy inventory', async () => {
    const manual = await shoppingListRepository.createList('Cotygodniowe', 'manual');
    const item = await shoppingListRepository.addItem(manual.id, {
      label: 'Mleko',
      quantity: 2,
      status: 'purchased',
    });

    const result = await shoppingListRepository.completePurchase(manual.id, {
      [item.id]: null,
    });
    const items = await shoppingListRepository.getItems(manual.id);
    const inventoryItems = await repository.getFullInventory();

    expect(result.inventoryIds).toHaveLength(2);
    expect(new Set(result.inventoryIds).size).toBe(2);
    expect(result.storedItemIds).toEqual([item.id]);
    expect(items[0]).toMatchObject({status: 'planned', storedAt: null});
    expect(inventoryItems).toHaveLength(2);
    expect(inventoryItems[0].name).toBe('Mleko');
    expect(inventoryItems[1].name).toBe('Mleko');
  });

  it('finalizuje tekstową pozycję z jednoznacznym powiązaniem katalogowym jako produkt po EAN', async () => {
    await repository.saveDefinition({
      ean: '5901234123457',
      name: 'Mleko 2%',
      brand: 'Lacpol',
      imageUrl: 'https://img/mleko.jpg',
      category: 'Nabial',
    });
    const catalog = db.execute('SELECT * FROM product_catalog WHERE product_ean = ?', [
      '5901234123457',
    ]).rows!.item(0);
    const manual = await shoppingListRepository.createList('Cotygodniowe', 'manual');
    const item = await shoppingListRepository.addItem(manual.id, {
      label: 'Mleko do kawy',
      quantity: 1,
      status: 'purchased',
    });

    await shoppingListRepository.linkCatalogProductToItem(item.id, catalog.id as string);
    await shoppingListRepository.completePurchase(manual.id, {[item.id]: null});

    const inventoryItems = await repository.getFullInventory();

    expect(inventoryItems).toHaveLength(1);
    expect(inventoryItems[0]).toMatchObject({
      ean: '5901234123457',
      name: 'Mleko 2%',
      imageUrl: 'https://img/mleko.jpg',
    });
  });

  it('po finalizacji produktów z sugestii przestaje pokazywać je w Do uzupełnienia', async () => {
    const auto = await shoppingListRepository.createList('Minimum', 'auto');
    const manual = await shoppingListRepository.createList('Zakupy', 'manual');
    const genericMilk = await shoppingListRepository.createGenericCatalogProduct('Mleko');
    const shoppingList = new ShoppingList(shoppingListRepository, repository);

    await shoppingListRepository.addItem(auto.id, {
      catalogProductId: genericMilk.id,
      label: genericMilk.name,
      quantity: 2,
    });

    expect(await shoppingList.generateReplenishmentSuggestions()).toMatchObject([
      {
        catalogProductId: genericMilk.id,
        missingQuantity: 2,
        currentQuantity: 0,
      },
    ]);

    await shoppingList.addAllSuggestionsToList(manual.id);
    const [suggestedItem] = await shoppingListRepository.getItems(manual.id);
    await shoppingList.updateItemStatus(suggestedItem.id, 'purchased');
    await shoppingList.completePurchase(manual.id, {[suggestedItem.id]: null});

    expect(await repository.getFullInventory()).toHaveLength(2);
    expect(await shoppingList.generateReplenishmentSuggestions()).toEqual([]);
  });
});
