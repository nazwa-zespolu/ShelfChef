import {sqlite} from '../helpers/sqlite';

jest.mock('react-native-quick-sqlite', () => ({
  open: () => sqlite,
}), {virtual: true});

import {ProductRepository} from '../../src/infrastructure/ProductRepository';
import {ShoppingListRepository} from '../../src/infrastructure/ShoppingListRepository';
import {setupDatabase} from '../../src/infrastructure/db/init';

describe('Product catalog metadata', () => {
  let products: ProductRepository;
  let shopping: ShoppingListRepository;
  const metadata = {
    name: 'Domowy sos',
    brand: 'Spichlerz',
    category: 'Przetwory warzywne',
    imageUrl: 'file:///photos/sauce.jpg',
  };

  beforeEach(() => {
    sqlite.reset();
    setupDatabase();
    products = new ProductRepository();
    shopping = new ShoppingListRepository();
  });

  afterAll(() => sqlite.close());

  it.each(['generic', 'specific'] as const)(
    'persists %s metadata across inventory, catalog lookups and shopping links after reopening',
    async kind => {
      const ean = kind === 'specific' ? '5901234123457' : null;
      if (ean) {
        await products.saveDefinition({...metadata, ean});
      }
      const catalog = ean
        ? (await products.findCatalogProductByEan(ean))!
        : await products.saveGenericCatalogProduct(metadata);
      await products.addToInventory('sauce-copy', ean, ean ? null : metadata.name, '2027-01-01');
      await products.markAsOpened('sauce-copy', '2026-10-20T09:30:00.000Z');
      const list = await shopping.createList('Zakupy', 'auto');
      const item = await shopping.addItem(list.id, {label: 'Sos'});
      await shopping.linkCatalogProductToItem(item.id, catalog.id);

      sqlite.reopen();
      setupDatabase();

      expect(await products.getFullInventory()).toEqual([
        expect.objectContaining({
          ...metadata,
          id: 'sauce-copy',
          ean: ean ?? '',
          expiryDate: '2027-01-01',
          isOpened: true,
          openedAt: '2026-10-20T09:30:00.000Z',
        }),
      ]);
      const expectedCatalog = {...metadata, id: catalog.id, kind, productEan: ean};
      expect(await products.findCatalogProductByNormalizedName(kind, 'domowy sos'))
        .toMatchObject(expectedCatalog);
      expect(await shopping.findCatalogProductById(catalog.id)).toMatchObject(expectedCatalog);
      expect(await shopping.findCatalogProductByNormalizedName(kind, 'domowy sos'))
        .toMatchObject(expectedCatalog);
      expect(await shopping.getCatalogProducts()).toEqual([expect.objectContaining(expectedCatalog)]);
      expect((await shopping.getItems(list.id))[0].linkedCatalogProducts)
        .toEqual([expect.objectContaining(expectedCatalog)]);
      if (ean) {
        expect(await products.findCatalogProductByEan(ean)).toMatchObject(expectedCatalog);
      }

      await products.removeFromInventory('sauce-copy');
      expect(await shopping.searchCatalogProducts(' SOS '))
        .toEqual([expect.objectContaining(expectedCatalog)]);
    },
  );

  it('updates generic metadata while preserving the catalog ID, photo and inventory state', async () => {
    const catalog = await products.saveGenericCatalogProduct(metadata);
    await products.addToInventory('sauce-copy', null, metadata.name, '2027-01-01');
    await products.markAsOpened('sauce-copy', '2026-10-20T09:30:00.000Z');

    const updated = await products.saveGenericCatalogProduct({
      name: '  Domowy sos  ',
      brand: '  Nowa marka  ',
      category: '  Sosy i dodatki  ',
      imageUrl: null,
    });
    const savedAgain = await products.saveGenericCatalogProduct({name: metadata.name});

    const expectedCatalog = {
      ...metadata,
      id: catalog.id,
      brand: 'Nowa marka',
      category: 'Sosy i dodatki',
    };
    expect(updated).toMatchObject(expectedCatalog);
    expect(savedAgain).toMatchObject(expectedCatalog);
    expect(await products.getFullInventory()).toEqual([
      expect.objectContaining({
        ...metadata,
        brand: 'Nowa marka',
        category: 'Sosy i dodatki',
        id: 'sauce-copy',
        expiryDate: '2027-01-01',
        isOpened: true,
        openedAt: '2026-10-20T09:30:00.000Z',
      }),
    ]);
    expect(await shopping.getCatalogProducts()).toHaveLength(1);
  });

  it('preserves existing generic metadata and photos when reused from shopping lists', async () => {
    const catalog = await products.saveGenericCatalogProduct(metadata);

    const reused = await shopping.createGenericCatalogProduct('  Domowy sos  ');
    sqlite.reopen();
    setupDatabase();

    expect(reused).toMatchObject({...metadata, id: catalog.id});
    expect(await shopping.findCatalogProductById(catalog.id)).toMatchObject(metadata);
    expect(await shopping.getCatalogProducts()).toHaveLength(1);
  });

  it.each(['product form', 'shopping list'])(
    'supports missing optional metadata when created from a %s',
    async source => {
      const catalog = source === 'product form'
        ? await products.saveGenericCatalogProduct({name: 'Domowy zakwas'})
        : await shopping.createGenericCatalogProduct('Domowy zakwas');
      await products.addToInventory('starter-copy', null, 'Domowy zakwas', null);

      expect(catalog).toMatchObject({brand: null, category: null, imageUrl: null});
      expect(await products.getFullInventory()).toEqual([
        expect.objectContaining({name: 'Domowy zakwas', brand: null, category: null, imageUrl: null}),
      ]);
    },
  );
});
