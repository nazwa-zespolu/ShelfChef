import {sqlite} from '../helpers/sqlite';

jest.mock('react-native-quick-sqlite', () => ({open: () => sqlite}), {
  virtual: true,
});

import {
  normalizeProductName,
  ProductRepository,
} from '../../src/infrastructure/ProductRepository';
import {ShoppingListRepository} from '../../src/infrastructure/ShoppingListRepository';
import {db, setupDatabase} from '../../src/infrastructure/db/init';

describe('Adding copies of an existing product without EAN', () => {
  let products: ProductRepository;
  let shopping: ShoppingListRepository;
  const original = {
    name: 'Żurek',
    brand: 'Domowa kuchnia',
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
    shopping = new ShoppingListRepository();
  });
  afterAll(() => sqlite.close());

  it.each(['product form', 'shopping list'] as const)(
    'preserves edited metadata, photos, instance state and shopping links when reused from a %s',
    async (source) => {
      const product = await products.saveGenericCatalogProduct(original);
      const edited = await products.updateCatalogProduct(product.id, {
        ...original,
        name: 'ŻUREK',
        brand: null,
      });
      await products.addToInventory(
        'opened-copy',
        null,
        original.name,
        '2999-01-01',
        product.id
      );
      await products.markAsOpened('opened-copy', '2026-11-01T10:00:00.000Z');
      const list = await shopping.createList('Zakupy', 'manual');
      await shopping.addItem(list.id, {
        label: original.name,
        catalogProductId: product.id,
      });
      const alternative = await shopping.addItem(list.id, {label: 'Zupa'});
      await shopping.linkCatalogProductToItem(alternative.id, product.id);
      const catalogBefore = rows('product_catalog');
      const inventoryBefore = rows('inventory');
      const itemsBefore = rows('shopping_list_items');
      const linksBefore = rows('shopping_list_item_catalog_products');

      const reused =
        source === 'product form'
          ? await products.saveGenericCatalogProduct({
              name: '  żurek  ',
              brand: 'Inna marka',
              category: 'Inna kategoria',
              imageUrl: 'file:///photos/other.jpg',
            })
          : await shopping.createGenericCatalogProduct(
              '  żurek  ',
              'file:///photos/other.jpg'
            );
      await products.saveGenericCatalogProduct({
        name: 'żurek',
        brand: null,
        category: null,
        imageUrl: null,
      });
      await products.addToInventory(
        'new-copy-1',
        null,
        reused.name,
        '2999-02-01',
        reused.id
      );
      await products.addToInventory(
        'new-copy-2',
        null,
        reused.name,
        '2999-02-01',
        reused.id
      );
      sqlite.reopen();
      setupDatabase();

      expect(reused).toEqual(edited);
      expect(rows('product_catalog')).toEqual(catalogBefore);
      expect(rows('inventory').slice(0, 1)).toEqual(inventoryBefore);
      expect(rows('shopping_list_items')).toEqual(itemsBefore);
      expect(rows('shopping_list_item_catalog_products')).toEqual(linksBefore);
      expect(await products.findCatalogProductById(product.id)).toEqual(edited);
      expect(await products.getFullInventory()).toEqual([
        expect.objectContaining({
          id: 'opened-copy',
          name: 'ŻUREK',
          brand: null,
          category: original.category,
          imageUrl: original.imageUrl,
          isOpened: true,
          expiryDate: '2999-01-01',
        }),
        expect.objectContaining({
          id: 'new-copy-1',
          catalogProductId: product.id,
          name: 'ŻUREK',
          brand: null,
          imageUrl: original.imageUrl,
          isOpened: false,
          expiryDate: '2999-02-01',
        }),
        expect.objectContaining({
          id: 'new-copy-2',
          catalogProductId: product.id,
          name: 'ŻUREK',
          brand: null,
          imageUrl: original.imageUrl,
          isOpened: false,
          expiryDate: '2999-02-01',
        }),
      ]);
    }
  );

  it('returns a product created after an empty lookup without applying stale manual metadata', async () => {
    expect(
      await products.findCatalogProductByNormalizedName('generic', 'żurek')
    ).toBeNull();
    const first = await products.saveGenericCatalogProduct(original);
    const reused = await products.saveGenericCatalogProduct({
      ...original,
      name: '  ŻUREK ',
      brand: 'Stale draft',
      imageUrl: 'file:///draft.jpg',
    });
    sqlite.reopen();
    setupDatabase();
    expect(reused).toEqual(first);
    expect(await products.findCatalogProductById(first.id)).toEqual(first);
    expect(await products.getCatalogProducts()).toHaveLength(1);
  });

  it('keeps the first product when normalized-name saves overlap', async () => {
    const [first, second] = await Promise.all([
      products.saveGenericCatalogProduct(original),
      products.saveGenericCatalogProduct({
        ...original,
        name: ' żurek ',
        brand: 'Other brand',
      }),
    ]);
    sqlite.reopen();
    setupDatabase();
    expect(first).toEqual(second);
    expect(await products.getCatalogProducts()).toEqual([first]);
    expect(first).toMatchObject(original);
  });

  it('matches only the exact normalized generic name even when specific products share it', async () => {
    await products.saveDefinition({...original, ean: '5901234123457'});
    await products.saveDefinition({...original, ean: '5901234123464'});
    const name = normalizeProductName(' ŻUREK ');
    expect(
      await products.findCatalogProductByNormalizedName('generic', name)
    ).toBeNull();
    const generic = await products.saveGenericCatalogProduct(original);
    expect(
      await products.findCatalogProductByNormalizedName('generic', name)
    ).toEqual(generic);
    for (const other of ['żur', 'żurek domowy', 'zurek']) {
      expect(
        await products.findCatalogProductByNormalizedName('generic', other)
      ).toBeNull();
    }
    expect(await products.getCatalogProducts()).toHaveLength(3);
  });

  it('rolls back creation if reading the saved catalog product fails', async () => {
    await products.saveGenericCatalogProduct(original);
    const before = rows('product_catalog');
    const execute = sqlite.execute.bind(sqlite);
    const failingRead = jest
      .spyOn(sqlite, 'execute')
      .mockImplementation((sql, params) => {
        if (sql.includes('FROM product_catalog catalog')) {
          throw new Error('catalog read failed');
        }
        return execute(sql, params);
      });
    try {
      await expect(
        products.saveGenericCatalogProduct({name: 'Nowa zupa'})
      ).rejects.toThrow('catalog read failed');
    } finally {
      failingRead.mockRestore();
    }
    sqlite.reopen();
    setupDatabase();
    expect(rows('product_catalog')).toEqual(before);
  });
});
