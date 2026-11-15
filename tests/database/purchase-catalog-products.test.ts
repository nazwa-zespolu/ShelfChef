import {sqlite} from '../helpers/sqlite';

jest.mock('react-native-quick-sqlite', () => ({open: () => sqlite}), {
  virtual: true,
});

import {ShoppingListType} from '../../src/domain/types';
import {ProductRepository} from '../../src/infrastructure/ProductRepository';
import {ShoppingListRepository} from '../../src/infrastructure/ShoppingListRepository';
import {db, setupDatabase} from '../../src/infrastructure/db/init';

describe('Catalog products created during purchase finalization', () => {
  let products: ProductRepository;
  let shopping: ShoppingListRepository;
  const metadata = {
    name: 'Śliwki',
    brand: 'Sad',
    category: 'Owoce',
    imageUrl: 'file:///photos/plums.jpg',
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
    shopping = new ShoppingListRepository();
  });

  afterAll(() => sqlite.close());

  it.each<ShoppingListType>(['manual', 'auto'])(
    'creates a generic catalog product and links every copy from a %s list',
    async (type) => {
      const list = await shopping.createList('Zakupy', type);
      const item = await shopping.addItem(list.id, {
        label: '  Chleb  ',
        quantity: 2,
        status: 'purchased',
        iconKey: 'box',
      });
      const result = await shopping.completePurchase(list.id, {
        [item.id]: '2999-01-01',
      });
      sqlite.reopen();
      setupDatabase();

      const catalog = (await products.getCatalogProducts())[0];
      expect(await products.getCatalogProducts()).toHaveLength(1);
      expect(catalog).toMatchObject({
        name: 'Chleb',
        normalizedName: 'chleb',
        kind: 'generic',
        productEan: null,
        brand: null,
        category: null,
        imageUrl: null,
      });
      expect(result.inventoryIds).toHaveLength(2);
      expect(result.storedItemIds).toEqual([item.id]);
      expect(await products.getFullInventory()).toEqual(
        result.inventoryIds.map((id) =>
          expect.objectContaining({
            id,
            catalogProductId: catalog.id,
            name: 'Chleb',
            ean: '',
            expiryDate: '2999-01-01',
            isOpened: false,
            openedAt: null,
          })
        )
      );
      expect((await shopping.getItems(list.id))[0]).toMatchObject({
        label: 'Chleb',
        catalogProductId: null,
        linkedCatalogProducts: [],
        iconKey: 'box',
        status: type === 'manual' ? 'planned' : 'stored',
      });

      await products.markAsOpened(
        result.inventoryIds[0],
        '2026-11-13T10:00:00.000Z'
      );
      await products.updateCatalogProduct(catalog.id, {
        name: 'Chleb żytni',
        brand: 'Piekarnia',
        category: 'Pieczywo',
        imageUrl: 'file:///photos/bread.jpg',
      });
      sqlite.reopen();
      setupDatabase();
      for (const copy of await products.getFullInventory()) {
        expect(copy).toMatchObject({
          catalogProductId: catalog.id,
          name: 'Chleb żytni',
          brand: 'Piekarnia',
          category: 'Pieczywo',
          imageUrl: 'file:///photos/bread.jpg',
          expiryDate: '2999-01-01',
          isOpened: copy.id === result.inventoryIds[0],
          openedAt:
            copy.id === result.inventoryIds[0]
              ? '2026-11-13T10:00:00.000Z'
              : null,
        });
      }
      expect((await shopping.getItems(list.id))[0].label).toBe('Chleb');
    }
  );

  it('reuses the normalized generic name without overwriting metadata or inferring an EAN', async () => {
    await products.saveDefinition({
      ...metadata,
      ean: '5901234123457',
      brand: 'Inna marka',
    });
    const generic = await products.saveGenericCatalogProduct(metadata);
    await products.addToInventory(
      'existing-copy',
      null,
      generic.name,
      null,
      generic.id
    );
    await products.markAsOpened('existing-copy', '2026-11-01T09:00:00.000Z');
    const inventoryBefore = rows('inventory');
    const catalogBefore = rows('product_catalog');
    const definitionsBefore = rows('product_definitions');
    const list = await shopping.createList('Zakupy', 'manual');
    const item = await shopping.addItem(list.id, {
      label: '  śLIWKI  ',
      quantity: 2,
      status: 'purchased',
    });
    await shopping.completePurchase(list.id);
    sqlite.reopen();
    setupDatabase();

    expect(rows('product_catalog')).toEqual(catalogBefore);
    expect(rows('product_definitions')).toEqual(definitionsBefore);
    expect(rows('inventory').slice(0, 1)).toEqual(inventoryBefore);
    expect(await products.getFullInventory()).toHaveLength(3);
    for (const copy of await products.getFullInventory()) {
      expect(copy).toMatchObject({
        ...metadata,
        ean: '',
        catalogProductId: generic.id,
      });
    }
    expect((await shopping.getItems(list.id))[0]).toMatchObject({
      id: item.id,
      label: 'śLIWKI',
      catalogProductId: null,
      linkedCatalogProducts: [],
    });
  });

  it('creates a generic product when only an EAN product has the same name', async () => {
    await products.saveDefinition({...metadata, ean: '5901234123457'});
    const specific = (await products.findCatalogProductByEan('5901234123457'))!;
    const list = await shopping.createList('Zakupy', 'manual');
    await shopping.addItem(list.id, {label: 'śliwki', status: 'purchased'});
    await shopping.completePurchase(list.id);
    sqlite.reopen();
    setupDatabase();

    const generic = (await products.findCatalogProductByNormalizedName(
      'generic',
      'śliwki'
    ))!;
    expect(generic).toMatchObject({
      kind: 'generic',
      name: 'śliwki',
      productEan: null,
      brand: null,
      category: null,
      imageUrl: null,
    });
    expect(await products.findCatalogProductById(specific.id)).toEqual(
      specific
    );
    expect(await products.getCatalogProducts()).toHaveLength(2);
    expect(await products.getFullInventory()).toEqual([
      expect.objectContaining({
        catalogProductId: generic.id,
        ean: '',
        name: 'śliwki',
        imageUrl: null,
      }),
    ]);
  });

  it('shares one generic product across text items, lists and subsequent purchases', async () => {
    const firstList = await shopping.createList('Pierwsze zakupy', 'manual');
    const first = await shopping.addItem(firstList.id, {
      label: 'Mleko',
      status: 'purchased',
    });
    await shopping.completePurchase(firstList.id);
    const secondList = await shopping.createList('Drugie zakupy', 'manual');
    await shopping.addItem(secondList.id, {
      label: '  mleko  ',
      quantity: 2,
      status: 'purchased',
    });
    await shopping.completePurchase(secondList.id);
    await shopping.updateItemStatus(first.id, 'purchased');
    await shopping.completePurchase(firstList.id);
    sqlite.reopen();
    setupDatabase();

    const catalog = (await products.getCatalogProducts())[0];
    expect(await products.getCatalogProducts()).toHaveLength(1);
    expect(await products.getFullInventory()).toHaveLength(4);
    for (const copy of await products.getFullInventory()) {
      expect(copy).toMatchObject({
        catalogProductId: catalog.id,
        name: 'Mleko',
        ean: '',
      });
    }
    expect((await shopping.getItems(firstList.id))[0].label).toBe('Mleko');
    expect((await shopping.getItems(secondList.id))[0].label).toBe('mleko');
  });

  it.each(['direct', 'alternative'])(
    'prefers a %s catalog association over a generic product matching the text',
    async (association) => {
      await products.saveGenericCatalogProduct(metadata);
      await products.saveDefinition({
        ean: '5901234123457',
        name: 'Śliwki suszone',
      });
      const specific = (await products.findCatalogProductByEan(
        '5901234123457'
      ))!;
      const catalogBefore = rows('product_catalog');
      const list = await shopping.createList('Zakupy', 'manual');
      const item = await shopping.addItem(list.id, {
        label: metadata.name,
        status: 'purchased',
        catalogProductId: association === 'direct' ? specific.id : null,
      });
      if (association === 'alternative') {
        await shopping.linkCatalogProductToItem(item.id, specific.id);
      }
      await shopping.completePurchase(list.id);
      sqlite.reopen();
      setupDatabase();

      expect(rows('product_catalog')).toEqual(catalogBefore);
      expect(await products.getFullInventory()).toEqual([
        expect.objectContaining({
          catalogProductId: specific.id,
          ean: specific.productEan,
          name: specific.name,
        }),
      ]);
    }
  );

  it.each<ShoppingListType>(['manual', 'auto'])(
    'rolls back new catalog products, all copies and item statuses after a failed %s purchase',
    async (type) => {
      const existing = await products.saveGenericCatalogProduct(metadata);
      const list = await shopping.createList('Zakupy', type);
      await shopping.addItem(list.id, {
        catalogProductId: existing.id,
        label: existing.name,
        status: 'purchased',
      });
      await shopping.addItem(list.id, {
        label: 'Chleb',
        quantity: 3,
        status: 'purchased',
      });
      const catalogBefore = rows('product_catalog');
      const itemsBefore = rows('shopping_list_items');
      const execute = sqlite.execute.bind(sqlite);
      let inserts = 0;
      const failingInsert = jest
        .spyOn(sqlite, 'execute')
        .mockImplementation((sql, params) => {
          if (sql.includes('INSERT INTO inventory') && ++inserts === 3) {
            throw new Error('inventory write failed');
          }
          return execute(sql, params);
        });
      try {
        await expect(shopping.completePurchase(list.id)).rejects.toThrow(
          'inventory write failed'
        );
      } finally {
        failingInsert.mockRestore();
      }
      sqlite.reopen();
      setupDatabase();
      expect(rows('product_catalog')).toEqual(catalogBefore);
      expect(rows('shopping_list_items')).toEqual(itemsBefore);
      expect(await products.getFullInventory()).toEqual([]);

      const retried = await shopping.completePurchase(list.id);
      sqlite.reopen();
      setupDatabase();
      expect(retried.inventoryIds).toHaveLength(4);
      expect(await products.getFullInventory()).toHaveLength(4);
      expect(await products.getCatalogProducts()).toHaveLength(2);
      expect(
        (await products.getFullInventory()).every(
          (copy) => copy.catalogProductId !== null
        )
      ).toBe(true);
    }
  );
});
