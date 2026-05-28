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
  is_locked: number;
  is_archived: number;
  locked_at: string | null;
  created_at: string;
  updated_at: string;
};

type ShoppingListItemRow = {
  id: string;
  list_id: string;
  catalog_product_id: string | null;
  label: string;
  quantity: number;
  status: 'planned' | 'purchased' | 'unavailable' | 'stored';
  source: 'manual' | 'suggestion' | 'reactivated';
  stored_at: string | null;
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
const shoppingListItems = new Map<string, ShoppingListItemRow>();
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

  if (normalized.startsWith('DELETE FROM SHOPPING_LIST_ITEMS')) {
    shoppingListItems.clear();
    return toRows([]);
  }

  if (normalized.startsWith('SELECT * FROM PRODUCT_CATALOG')) {
    if (normalized.includes('WHERE PRODUCT_EAN = ?')) {
      const row = Array.from(productCatalog.values()).find(item => item.product_ean === params[0]);
      return toRows(row ? [row] : []);
    }
    return toRows(Array.from(productCatalog.values()));
  }

  if (normalized.startsWith('SELECT * FROM SHOPPING_LISTS')) {
    if (normalized.includes('WHERE ID = ?')) {
      const row = shoppingLists.get(params[0]);
      return toRows(row ? [row] : []);
    }
    const includeArchived = params[0] === 1;
    return toRows(
      Array.from(shoppingLists.values())
        .filter(row => includeArchived || row.is_archived === 0)
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    );
  }

  if (normalized.startsWith('SELECT * FROM SHOPPING_LIST_ITEMS')) {
    if (normalized.includes('WHERE LIST_ID = ? AND CATALOG_PRODUCT_ID = ?')) {
      const [listId, catalogProductId] = params;
      const row = Array.from(shoppingListItems.values())
        .filter(item => item.list_id === listId && item.catalog_product_id === catalogProductId)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
      return toRows(row ? [row] : []);
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
      return toRows(row ? [row] : []);
    }
    if (normalized.includes('WHERE LIST_ID = ?')) {
      const [listId] = params;
      return toRows(
        Array.from(shoppingListItems.values())
          .filter(item => item.list_id === listId)
          .sort((a, b) => a.created_at.localeCompare(b.created_at)),
      );
    }
    return toRows(Array.from(shoppingListItems.values()));
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

  if (normalized.startsWith('INSERT INTO SHOPPING_LISTS')) {
    const [id, name, type, createdAt, updatedAt] = params;
    shoppingLists.set(id, {
      id,
      name,
      type,
      is_locked: 0,
      is_archived: 0,
      locked_at: null,
      created_at: createdAt,
      updated_at: updatedAt,
    });
    return toRows([]);
  }

  if (normalized.startsWith('INSERT INTO SHOPPING_LIST_ITEMS')) {
    const [
      id,
      listId,
      catalogProductId,
      label,
      quantity,
      statusOrCreatedAt,
      sourceOrUpdatedAt,
      maybeCreatedAt,
      maybeUpdatedAt,
    ] = params;
    const hasExplicitStatus = maybeUpdatedAt !== undefined;
    shoppingListItems.set(id, {
      id,
      list_id: listId,
      catalog_product_id: catalogProductId ?? null,
      label,
      quantity,
      status: hasExplicitStatus ? statusOrCreatedAt : 'planned',
      source: hasExplicitStatus ? sourceOrUpdatedAt : 'suggestion',
      stored_at: null,
      created_at: hasExplicitStatus ? maybeCreatedAt : statusOrCreatedAt,
      updated_at: hasExplicitStatus ? maybeUpdatedAt : sourceOrUpdatedAt,
    });
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

  if (normalized.startsWith('UPDATE SHOPPING_LIST_ITEMS SET STATUS = \'PLANNED\'')) {
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
        return {
          id: item.id,
          label: item.label,
          quantity: item.quantity,
          catalog_product_id: item.catalog_product_id,
          product_ean: catalog?.product_ean ?? null,
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
    db.execute('DELETE FROM shopping_list_items');
    db.execute('PRAGMA user_version = 0');
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
      imageUrl: undefined,
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

    expect(version.user_version).toBe(2);
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
      id: 'catalog-specific-5901234123457',
      name: 'Mleko 2%',
      normalized_name: 'mleko 2%',
      kind: 'specific',
      product_ean: '5901234123457',
      parent_catalog_product_id: null,
    });
  });

  it('tworzy listy zakupów i dodaje tekstową pozycję do listy manual', async () => {
    const list = await shoppingListRepository.createList('Cotygodniowe', 'manual');
    const item = await shoppingListRepository.addItem(list.id, {
      label: 'Mleko',
      quantity: 2,
    });

    const lists = await shoppingListRepository.getLists();
    const items = await shoppingListRepository.getItems(list.id);

    expect(lists.map(l => l.name)).toContain('Cotygodniowe');
    expect(item).toMatchObject({
      listId: list.id,
      catalogProductId: null,
      label: 'Mleko',
      quantity: 2,
      status: 'planned',
      source: 'manual',
    });
    expect(items).toHaveLength(1);
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
      status: 'unavailable',
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
    expect(items[0]).toMatchObject({status: 'stored'});
    expect(inventoryItems).toHaveLength(2);
    expect(inventoryItems[0].name).toBe('Mleko');
    expect(inventoryItems[1].name).toBe('Mleko');
  });
});
