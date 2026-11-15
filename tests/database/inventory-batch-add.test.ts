import {sqlite} from '../helpers/sqlite';

jest.mock('react-native-quick-sqlite', () => ({open: () => sqlite}), {
  virtual: true,
});

import {ProductRepository} from '../../src/infrastructure/ProductRepository';
import {db, setupDatabase} from '../../src/infrastructure/db/init';

const modes = ['EAN', 'generic name', 'generic ID', 'EAN ID'] as const;
type Mode = (typeof modes)[number];

describe('Atomic inventory batch adding', () => {
  let products: ProductRepository;
  const metadata = {
    name: 'Żurek',
    brand: 'Spichlerz',
    category: 'Zupy',
    imageUrl: 'file:///photos/soup.jpg',
  };
  const rows = (table: string) => {
    const result = db.execute(`SELECT * FROM ${table} ORDER BY rowid`).rows!;
    return Array.from({length: result.length}, (_, index) =>
      result.item(index)
    );
  };

  beforeEach(() => {
    sqlite.reset();
    setupDatabase();
    products = new ProductRepository();
  });
  afterAll(() => sqlite.close());

  const createProduct = async (mode: Mode) => {
    const ean = mode.startsWith('EAN') ? '5901234123457' : null;
    if (ean) {
      await products.saveDefinition({...metadata, ean});
    }
    const catalog = ean
      ? (await products.findCatalogProductByEan(ean))!
      : await products.saveGenericCatalogProduct(metadata);
    return {
      catalog,
      ean,
      customName: ean ? null : '  żUREK  ',
      catalogId: mode.endsWith('ID') ? catalog.id : undefined,
    };
  };

  it.each(modes)(
    'resolves %s once and persists all copies after reopening',
    async (mode) => {
      const {catalog, ean, customName, catalogId} = await createProduct(mode);
      const ids = ['copy-1', 'copy-2', 'copy-3', 'copy-4', 'copy-5'];
      const execute = jest.spyOn(sqlite, 'execute');
      try {
        await products.addToInventoryBatch(
          ids,
          ean,
          customName,
          '2999-01-01',
          catalogId
        );
        const lookups = execute.mock.calls.filter(
          ([sql]) =>
            sql.trimStart().startsWith('SELECT') &&
            sql.includes('FROM product_catalog')
        );
        expect(lookups).toHaveLength(1);
      } finally {
        execute.mockRestore();
      }
      sqlite.reopen();
      setupDatabase();

      expect(await products.getFullInventory()).toEqual(
        ids.map((id) =>
          expect.objectContaining({
            ...metadata,
            id,
            catalogProductId: catalog.id,
            ean: ean ?? '',
            expiryDate: '2999-01-01',
            isOpened: false,
            openedAt: null,
          })
        )
      );
    }
  );

  it.each(modes)(
    'rolls back a failed third insert and retries exactly five copies using %s',
    async (mode) => {
      const {catalog, ean, customName, catalogId} = await createProduct(mode);
      await products.addToInventory(
        'existing-copy',
        ean,
        customName,
        '2998-01-01',
        catalog.id
      );
      await products.markAsOpened('existing-copy', '2026-11-01T10:00:00.000Z');
      const inventoryBefore = rows('inventory');
      const catalogBefore = rows('product_catalog');
      const definitionsBefore = rows('product_definitions');
      const ids = ['copy-1', 'copy-2', 'copy-3', 'copy-4', 'copy-5'];
      const execute = sqlite.execute.bind(sqlite);
      let inserts = 0;
      const failure = jest
        .spyOn(sqlite, 'execute')
        .mockImplementation((sql, params) => {
          if (sql.includes('INSERT INTO inventory') && ++inserts === 3) {
            throw new Error('third inventory insert failed');
          }
          return execute(sql, params);
        });
      try {
        await expect(
          products.addToInventoryBatch(ids, ean, customName, null, catalogId)
        ).rejects.toThrow('third inventory insert failed');
      } finally {
        failure.mockRestore();
      }
      sqlite.reopen();
      setupDatabase();
      expect(rows('inventory')).toEqual(inventoryBefore);
      expect(rows('product_catalog')).toEqual(catalogBefore);
      expect(rows('product_definitions')).toEqual(definitionsBefore);

      await products.addToInventoryBatch(ids, ean, customName, null, catalogId);
      sqlite.reopen();
      setupDatabase();
      expect(await products.getFullInventory()).toHaveLength(6);
      expect(rows('inventory').slice(0, 1)).toEqual(inventoryBefore);
      expect(rows('product_catalog')).toEqual(catalogBefore);
      expect(rows('product_definitions')).toEqual(definitionsBefore);
      const added = (await products.getFullInventory()).filter((copy) =>
        ids.includes(copy.id)
      );
      expect(added).toHaveLength(5);
      for (const copy of added) {
        expect(copy).toMatchObject({
          ...metadata,
          catalogProductId: catalog.id,
          ean: ean ?? '',
          expiryDate: null,
          isOpened: false,
          openedAt: null,
        });
      }
    }
  );

  it('rolls back earlier inserts after an actual SQLite primary-key conflict', async () => {
    const {catalog} = await createProduct('generic ID');
    await products.addToInventory(
      'existing-copy',
      null,
      catalog.name,
      null,
      catalog.id
    );
    const before = rows('inventory');
    await expect(
      products.addToInventoryBatch(
        ['new-copy', 'existing-copy', 'last-copy'],
        null,
        catalog.name,
        null,
        catalog.id
      )
    ).rejects.toThrow();
    sqlite.reopen();
    setupDatabase();
    expect(rows('inventory')).toEqual(before);
  });

  it.each(['missing product', 'wrong EAN', 'generic product with EAN'])(
    'rejects the entire batch for an invalid explicit link: %s',
    async (scenario) => {
      const {catalog} = await createProduct(
        scenario === 'generic product with EAN' ? 'generic ID' : 'EAN ID'
      );
      const catalogId = scenario === 'missing product' ? 'missing' : catalog.id;
      await expect(
        products.addToInventoryBatch(
          ['copy-1', 'copy-2'],
          '5909999999999',
          null,
          null,
          catalogId
        )
      ).rejects.toThrow();
      sqlite.reopen();
      setupDatabase();
      expect(await products.getFullInventory()).toEqual([]);
    }
  );

  it('rejects an empty batch', async () => {
    await expect(
      products.addToInventoryBatch([], null, 'Żurek', null)
    ).rejects.toThrow('At least one inventory ID is required');
    expect(await products.getFullInventory()).toEqual([]);
  });
});
