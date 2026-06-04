type ProductDefinitionRow = {
  ean: string;
  name: string;
  brand: string | null;
  image_url: string | null;
  category: string | null;
  normalized_name: string | null;
  is_vegetarian: number | null;
  is_vegan: number | null;
  is_gluten_free: number | null;
  is_lactose_free: number | null;
};

type InventoryRow = {
  id: string;
  product_ean: string | null;
  custom_name: string | null;
  expiry_date: string | null;
  opened_at: string | null;
  is_opened: number;
  is_vegetarian: number | null;
  is_vegan: number | null;
  is_gluten_free: number | null;
  is_lactose_free: number | null;
};

type SQLiteResult = {
  rows: {
    length: number;
    item: (index: number) => Record<string, unknown>;
  };
};

const productDefinitions = new Map<string, ProductDefinitionRow>();
const inventory = new Map<string, InventoryRow>();
const appSettings = new Map<string, string>();
const productDefinitionColumns = new Set([
  'ean',
  'name',
  'brand',
  'image_url',
  'category',
]);
const inventoryColumns = new Set([
  'id',
  'product_ean',
  'custom_name',
  'expiry_date',
  'opened_at',
  'is_opened',
]);
const DIETARY_COLUMNS = [
  'is_vegetarian',
  'is_vegan',
  'is_gluten_free',
  'is_lactose_free',
] as const;

const toRows = (data: Record<string, unknown>[]): SQLiteResult => ({
  rows: {
    length: data.length,
    item: (index: number) => data[index],
  },
});

const execute = (sql: string, params: any[] = []): SQLiteResult => {
  const normalized = sql.replace(/\s+/g, ' ').trim().toUpperCase();

  if (normalized.startsWith('CREATE TABLE')) {
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

  if (normalized.startsWith('DELETE FROM APP_SETTINGS')) {
    appSettings.clear();
    return toRows([]);
  }

  if (normalized.startsWith('PRAGMA TABLE_INFO(PRODUCT_DEFINITIONS)')) {
    return toRows(
      Array.from(productDefinitionColumns).map((name, index) => ({
        cid: index,
        name,
        type: name === 'normalized_name' ? 'TEXT' : 'TEXT',
        notnull: name === 'name' ? 1 : 0,
        dflt_value: null,
        pk: name === 'ean' ? 1 : 0,
      })),
    );
  }

  if (
    normalized.startsWith(
      'ALTER TABLE PRODUCT_DEFINITIONS ADD COLUMN NORMALIZED_NAME TEXT',
    )
  ) {
    productDefinitionColumns.add('normalized_name');
    return toRows([]);
  }

  for (const column of DIETARY_COLUMNS) {
    if (
      normalized.startsWith(
        `ALTER TABLE PRODUCT_DEFINITIONS ADD COLUMN ${column.toUpperCase()} INTEGER`,
      )
    ) {
      productDefinitionColumns.add(column);
      return toRows([]);
    }
    if (
      normalized.startsWith(
        `ALTER TABLE INVENTORY ADD COLUMN ${column.toUpperCase()} INTEGER`,
      )
    ) {
      inventoryColumns.add(column);
      return toRows([]);
    }
  }

  if (normalized.startsWith('PRAGMA TABLE_INFO(INVENTORY)')) {
    return toRows(
      Array.from(inventoryColumns).map((name, index) => ({
        cid: index,
        name,
        type: 'INTEGER',
        notnull: 0,
        dflt_value: null,
        pk: name === 'id' ? 1 : 0,
      })),
    );
  }

  if (normalized.startsWith('SELECT * FROM PRODUCT_DEFINITIONS WHERE EAN = ?')) {
    const ean = params[0];
    const row = productDefinitions.get(ean);
    return toRows(row ? [row] : []);
  }

  if (
    normalized.startsWith(
      "SELECT EAN, NAME FROM PRODUCT_DEFINITIONS WHERE NORMALIZED_NAME IS NULL AND TRIM(NAME) <> '' ORDER BY EAN LIMIT ?",
    )
  ) {
    const limit = Number(params[0] ?? 50);
    const rows = Array.from(productDefinitions.values())
      .filter(row => row.normalized_name == null && row.name.trim() !== '')
      .sort((a, b) => a.ean.localeCompare(b.ean))
      .slice(0, limit)
      .map(row => ({ ean: row.ean, name: row.name }));
    return toRows(rows);
  }

  if (
    normalized.startsWith(
      'SELECT VALUE FROM APP_SETTINGS WHERE KEY = ?',
    )
  ) {
    const [key] = params;
    const value = appSettings.get(key);
    return toRows(value == null ? [] : [{ value }]);
  }

  if (
    normalized.startsWith(
      'INSERT INTO PRODUCT_DEFINITIONS (EAN, NAME, BRAND, IMAGE_URL, CATEGORY, IS_VEGETARIAN, IS_VEGAN, IS_GLUTEN_FREE, IS_LACTOSE_FREE) VALUES',
    )
  ) {
    const [ean, name, brand, imageUrl, category, isVegetarian, isVegan, isGlutenFree, isLactoseFree] =
      params;
    const existing = productDefinitions.get(ean);
    productDefinitions.set(ean, {
      ean,
      name,
      brand: brand ?? null,
      image_url: imageUrl ?? null,
      category: category ?? null,
      normalized_name: existing?.normalized_name ?? null,
      is_vegetarian:
        isVegetarian != null ? Number(isVegetarian) : existing?.is_vegetarian ?? null,
      is_vegan: isVegan != null ? Number(isVegan) : existing?.is_vegan ?? null,
      is_gluten_free:
        isGlutenFree != null ? Number(isGlutenFree) : existing?.is_gluten_free ?? null,
      is_lactose_free:
        isLactoseFree != null ? Number(isLactoseFree) : existing?.is_lactose_free ?? null,
    });
    return toRows([]);
  }

  if (
    normalized.startsWith(
      "UPDATE PRODUCT_DEFINITIONS SET NORMALIZED_NAME = ? WHERE EAN = ? AND (NORMALIZED_NAME IS NULL OR TRIM(NORMALIZED_NAME) = '')",
    )
  ) {
    const [normalizedName, ean] = params;
    const row = productDefinitions.get(ean);
    if (row && (row.normalized_name == null || row.normalized_name.trim() === '')) {
      productDefinitions.set(ean, {
        ...row,
        normalized_name: String(normalizedName),
      });
    }
    return toRows([]);
  }

  if (
    normalized.startsWith(
      'INSERT OR IGNORE INTO PRODUCT_DEFINITIONS (EAN, NAME, BRAND, IMAGE_URL, CATEGORY) VALUES',
    )
  ) {
    return toRows([]);
  }

  if (
    normalized.startsWith(
      'INSERT OR REPLACE INTO APP_SETTINGS (KEY, VALUE) VALUES (?, ?)',
    )
  ) {
    const [key, value] = params;
    appSettings.set(key, String(value));
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
      is_vegetarian: null,
      is_vegan: null,
      is_gluten_free: null,
      is_lactose_free: null,
    });
    return toRows([]);
  }

  if (
    normalized.startsWith(
      'INSERT OR IGNORE INTO INVENTORY (ID, PRODUCT_EAN, CUSTOM_NAME, EXPIRY_DATE, IS_OPENED) VALUES',
    )
  ) {
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

  if (
    normalized.startsWith(
      'SELECT I.CUSTOM_NAME, D.NAME AS DEFINITION_NAME, COALESCE(I.IS_VEGETARIAN, D.IS_VEGETARIAN) AS IS_VEGETARIAN',
    )
  ) {
    const rows = Array.from(inventory.values())
      .map(row => {
        const def = row.product_ean ? productDefinitions.get(row.product_ean) : undefined;
        const isVegetarian = row.is_vegetarian ?? def?.is_vegetarian ?? null;
        const isVegan = row.is_vegan ?? def?.is_vegan ?? null;
        const isGlutenFree = row.is_gluten_free ?? def?.is_gluten_free ?? null;
        const isLactoseFree = row.is_lactose_free ?? def?.is_lactose_free ?? null;
        return {
          custom_name: row.custom_name,
          definition_name: def?.name ?? null,
          is_vegetarian: isVegetarian,
          is_vegan: isVegan,
          is_gluten_free: isGlutenFree,
          is_lactose_free: isLactoseFree,
          expiry_date: row.expiry_date,
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
      })
      .map(({ expiry_date: _ignored, ...rest }) => rest);

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
    db.execute('DELETE FROM app_settings');
    productDefinitionColumns.delete('normalized_name');
    for (const column of DIETARY_COLUMNS) {
      productDefinitionColumns.delete(column);
      inventoryColumns.delete(column);
    }
    setupDatabase();
    repository = new ProductRepository();
  });

  it('wykonuje migracje schema_version i kolumny dietetyczne', async () => {
    const columnInfo = db.execute('PRAGMA table_info(product_definitions)');
    const columnNames: string[] = [];
    const rows = columnInfo.rows;

    if (rows) {
      for (let i = 0; i < rows.length; i++) {
        const row = rows.item(i);
        columnNames.push(String(row.name));
      }
    }

    const schemaVersion = db.execute(
      'SELECT value FROM app_settings WHERE key = ?',
      ['schema_version'],
    );
    const schemaRows = schemaVersion.rows;

    expect(columnNames).toContain('is_vegetarian');
    expect(schemaRows?.length).toBe(1);
    expect(schemaRows?.item(0).value).toBe('3');
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

  it('nie nadpisuje flag dietetycznych przy zwyklym update definicji', async () => {
    await repository.saveDefinition({
      ean: '5901234123457',
      name: 'Mleko',
      brand: 'Lacpol',
      imageUrl: 'https://img/mleko.jpg',
      category: 'Nabial',
      dietary: {
        isVegetarian: true,
        isVegan: false,
        isGlutenFree: true,
        isLactoseFree: false,
      },
    });

    await repository.saveDefinition({
      ean: '5901234123457',
      name: 'Mleko 2%',
      brand: 'Lacpol',
      imageUrl: 'https://img/mleko2.jpg',
      category: 'Nabial',
    });

    const found = await repository.findDefinitionByEan('5901234123457');

    expect(found?.dietary).toEqual({
      isVegetarian: true,
      isVegan: false,
      isGlutenFree: true,
      isLactoseFree: false,
    });
  });

  it('filtruje skladniki po diecie wegetarianskiej', async () => {
    await repository.saveDefinition({
      ean: '111',
      name: 'Jajka',
      dietary: {
        isVegetarian: true,
        isVegan: false,
        isGlutenFree: true,
        isLactoseFree: true,
      },
    });
    await repository.saveDefinition({
      ean: '222',
      name: 'Kurczak',
      dietary: {
        isVegetarian: false,
        isVegan: false,
        isGlutenFree: true,
        isLactoseFree: true,
      },
    });

    await repository.addToInventory('inv-1', '111', null, '2026-01-01');
    await repository.addToInventory('inv-2', '222', null, '2026-01-02');

    const names = await repository.getRecipeIngredientNames('vegetarian');

    expect(names).toEqual(['Jajka']);
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
});
