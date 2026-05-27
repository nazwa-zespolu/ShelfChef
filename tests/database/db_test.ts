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
  kind: 'generic' | 'concrete';
  product_ean: string | null;
  parent_catalog_product_id: string | null;
  created_at: string;
  updated_at: string;
};

type ShoppingListRow = {
  id: string;
  name: string;
  type: 'manual' | 'auto';
  is_locked: number;
  is_archived: number;
  locked_at: string | null;
  created_at: string;
  updated_at: string;
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
let userVersion = 0;

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

  if (normalized === 'PRAGMA USER_VERSION') {
    return toRows([{user_version: userVersion}]);
  }

  if (normalized.startsWith('PRAGMA USER_VERSION =')) {
    userVersion = Number(normalized.split('=')[1]?.trim() ?? 0);
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

  if (normalized.startsWith('SELECT * FROM PRODUCT_CATALOG')) {
    return toRows(Array.from(productCatalog.values()));
  }

  if (normalized.startsWith('SELECT * FROM SHOPPING_LISTS')) {
    return toRows(Array.from(shoppingLists.values()));
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

  if (normalized.startsWith('INSERT OR IGNORE INTO PRODUCT_DEFINITIONS')) {
    // Sample seed SQL is intentionally ignored by this lightweight mock.
    return toRows([]);
  }

  if (normalized.startsWith('INSERT OR IGNORE INTO INVENTORY')) {
    // Sample seed SQL is intentionally ignored by this lightweight mock.
    return toRows([]);
  }

  if (normalized.startsWith('INSERT OR IGNORE INTO PRODUCT_CATALOG')) {
    for (const row of productDefinitions.values()) {
      const id = `catalog-concrete-${row.ean}`;
      const eanAlreadyExists = Array.from(productCatalog.values()).some(
        item => item.product_ean === row.ean,
      );
      if (!productCatalog.has(id) && !eanAlreadyExists) {
        productCatalog.set(id, {
          id,
          name: row.name,
          normalized_name: row.name.trim().toLowerCase(),
          kind: 'concrete',
          product_ean: row.ean,
          parent_catalog_product_id: null,
          created_at: '2026-05-27T00:00:00.000Z',
          updated_at: '2026-05-27T00:00:00.000Z',
        });
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
        is_locked: 0,
        is_archived: 0,
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
    normalized.startsWith(
      'SELECT I.ID, I.EXPIRY_DATE, I.OPENED_AT, I.IS_OPENED, I.CUSTOM_NAME, D.EAN, D.NAME, D.BRAND, D.IMAGE_URL, D.CATEGORY FROM INVENTORY I LEFT JOIN PRODUCT_DEFINITIONS D ON I.PRODUCT_EAN = D.EAN ORDER BY I.EXPIRY_DATE ASC',
    )
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
          ean: def?.ean ?? null,
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
import { InventoryItem, ProductDefinition } from '../../src/domain/types';

describe('ProductRepository + database integration', () => {
  let repository: ProductRepository;

  beforeEach(() => {
    db.execute('DELETE FROM inventory');
    db.execute('DELETE FROM product_definitions');
    db.execute('DELETE FROM product_catalog');
    db.execute('DELETE FROM shopping_lists');
    db.execute('PRAGMA user_version = 0');
    setupDatabase();
    repository = new ProductRepository();
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

  it('migruje schemat list zakupów i tworzy domyślną listę automatyczną', () => {
    const version = db.execute('PRAGMA user_version').rows!.item(0);
    const lists = db.execute('SELECT * FROM shopping_lists').rows!;

    expect(version.user_version).toBe(1);
    expect(lists.length).toBe(1);
    expect(lists.item(0)).toMatchObject({
      id: 'default-auto-minimum',
      name: 'Moje minimum',
      type: 'auto',
      is_locked: 0,
      is_archived: 0,
    });
  });

  it('backfilluje katalog produktów z istniejących definicji bez parenta', () => {
    db.execute('DELETE FROM inventory');
    db.execute('DELETE FROM product_definitions');
    db.execute('DELETE FROM product_catalog');
    db.execute('DELETE FROM shopping_lists');
    db.execute('PRAGMA user_version = 0');
    db.execute(
      'INSERT OR REPLACE INTO product_definitions (ean, name, brand, image_url, category) VALUES (?, ?, ?, ?, ?)',
      ['5901234123457', 'Mleko 2%', 'Lacpol', null, 'Nabial'],
    );

    setupDatabase();

    const catalog = db.execute('SELECT * FROM product_catalog').rows!;

    expect(catalog.length).toBe(1);
    expect(catalog.item(0)).toMatchObject({
      id: 'catalog-concrete-5901234123457',
      name: 'Mleko 2%',
      normalized_name: 'mleko 2%',
      kind: 'concrete',
      product_ean: '5901234123457',
      parent_catalog_product_id: null,
    });
  });

  it('nie duplikuje katalogu ani domyślnej listy przy ponownym setupDatabase', () => {
    db.execute('DELETE FROM inventory');
    db.execute('DELETE FROM product_definitions');
    db.execute('DELETE FROM product_catalog');
    db.execute('DELETE FROM shopping_lists');
    db.execute('PRAGMA user_version = 0');
    db.execute(
      'INSERT OR REPLACE INTO product_definitions (ean, name, brand, image_url, category) VALUES (?, ?, ?, ?, ?)',
      ['5901234123457', 'Mleko 2%', 'Lacpol', null, 'Nabial'],
    );

    setupDatabase();
    setupDatabase();

    expect(db.execute('SELECT * FROM product_catalog').rows!.length).toBe(1);
    expect(db.execute('SELECT * FROM shopping_lists').rows!.length).toBe(1);
  });
});
