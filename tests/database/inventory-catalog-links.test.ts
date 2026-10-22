import {sqlite} from '../helpers/sqlite';

jest.mock('react-native-quick-sqlite', () => ({open: () => sqlite}), {virtual: true});

import {ShoppingList} from '../../src/app/ShoppingList';
import {CatalogProduct} from '../../src/domain/types';
import {ProductRepository, normalizeProductName} from '../../src/infrastructure/ProductRepository';
import {ShoppingListRepository} from '../../src/infrastructure/ShoppingListRepository';
import {db, setupDatabase} from '../../src/infrastructure/db/init';

describe('Inventory catalog links', () => {
  let products: ProductRepository;
  let shopping: ShoppingListRepository;
  const metadata = {
    name: 'Żurek',
    brand: 'Domowa kuchnia',
    category: 'Zupy',
    imageUrl: 'file:///photos/soup.jpg',
  };

  beforeEach(() => {
    sqlite.reset();
    setupDatabase();
    products = new ProductRepository();
    shopping = new ShoppingListRepository();
  });

  afterAll(() => sqlite.close());

  const createProduct = async (kind: 'generic' | 'specific'): Promise<CatalogProduct> => {
    if (kind === 'generic') {
      return products.saveGenericCatalogProduct(metadata);
    }
    await products.saveDefinition({...metadata, ean: '5901234123457'});
    return (await products.findCatalogProductByEan('5901234123457'))!;
  };

  // Catalog editing is introduced in the next stage. Simulate it in SQLite here.
  const renameProduct = (product: CatalogProduct, name: string) => {
    db.execute('UPDATE product_catalog SET name = ?, normalized_name = ? WHERE id = ?', [
      name, normalizeProductName(name), product.id,
    ]);
    if (product.productEan) {
      db.execute('UPDATE product_definitions SET name = ? WHERE ean = ?', [name, product.productEan]);
    }
  };

  it('keeps generic copies, metadata and independent item state linked after a rename and reopening', async () => {
    const product = await createProduct('generic');
    await products.addToInventory('opened-copy', null, metadata.name, '2999-01-01', product.id);
    await products.addToInventory('closed-copy', null, '  żUREK  ', null);
    await products.addToInventory('expired-copy', null, metadata.name, '2000-01-01', product.id);
    await products.markAsOpened('opened-copy', '2026-10-20T09:30:00.000Z');
    renameProduct(product, 'Żurek domowy');

    sqlite.reopen();
    setupDatabase();

    const items = await products.getFullInventory();
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(item).toMatchObject({...metadata, name: 'Żurek domowy', catalogProductId: product.id});
    }
    expect(items.find(item => item.id === 'opened-copy')).toMatchObject({
      expiryDate: '2999-01-01', isOpened: true, openedAt: '2026-10-20T09:30:00.000Z',
    });
    expect(items.find(item => item.id === 'closed-copy')).toMatchObject({
      expiryDate: null, isOpened: false, openedAt: null,
    });
    expect(await products.countFreshInventoryByCustomName(' ŻUREK DOMOWY ', '2026-10-22')).toBe(2);
    expect(await products.countFreshInventoryByCustomName(metadata.name, '2026-10-22')).toBe(0);
    expect(await products.getRecipeIngredientNames()).toEqual(Array(3).fill('Żurek domowy'));
    expect(await products.countItemsPendingDietaryCategorization()).toBe(3);
    expect(await products.getItemsPendingDietaryCategorization()).toEqual(expect.arrayContaining([
      expect.objectContaining({inventoryId: 'opened-copy', name: 'Żurek domowy'}),
      expect.objectContaining({inventoryId: 'closed-copy', name: 'Żurek domowy'}),
    ]));
    expect((await products.getDebugSnapshot()).inventory).toEqual(expect.arrayContaining([
      expect.objectContaining({id: 'opened-copy', catalog_product_id: product.id}),
    ]));

    await products.addToInventory('new-copy', null, metadata.name, null, product.id);
    expect((await products.getFullInventory()).find(item => item.id === 'new-copy'))
      .toMatchObject({name: 'Żurek domowy', catalogProductId: product.id});
  });

  it('resolves an EAN to a stable catalog ID and preserves it on subsequent definition saves', async () => {
    const product = await createProduct('specific');
    await products.addToInventory('ean-copy', product.productEan, null, '2999-01-01');
    await products.saveDefinition({...metadata, ean: product.productEan!, name: 'Żurek na zakwasie'});

    sqlite.reopen();
    setupDatabase();

    expect(await products.getFullInventory()).toEqual([
      expect.objectContaining({
        ...metadata, id: 'ean-copy', name: 'Żurek na zakwasie', catalogProductId: product.id,
      }),
    ]);
  });

  it.each(['missing product', 'wrong EAN', 'generic product with EAN'])(
    'rejects an invalid explicit catalog link: %s',
    async scenario => {
      const product = await createProduct(scenario === 'generic product with EAN' ? 'generic' : 'specific');
      const id = scenario === 'missing product' ? 'missing-catalog-id' : product.id;
      const ean = scenario === 'missing product' ? product.productEan : '5909999999999';

      await expect(products.addToInventory('invalid-copy', ean, metadata.name, null, id)).rejects.toThrow();

      expect(await products.getFullInventory()).toEqual([]);
    },
  );

  it('keeps catalog list quantities and suggestions tied to a renamed product', async () => {
    const product = await createProduct('generic');
    const auto = await shopping.createList('Minimum', 'auto');
    await shopping.addItem(auto.id, {catalogProductId: product.id, label: metadata.name, quantity: 3});
    const manual = await shopping.createList('Zakupy', 'manual');
    const textItem = await shopping.addItem(manual.id, {label: 'Zupa na obiad', quantity: 2});
    await shopping.linkCatalogProductToItem(textItem.id, product.id);
    await products.addToInventory('soup-copy', null, metadata.name, null, product.id);
    renameProduct(product, 'Żurek domowy');
    const other = await products.saveGenericCatalogProduct({name: metadata.name});
    await products.addToInventory('other-product', null, metadata.name, null, other.id);

    const lists = new ShoppingList(shopping, products);
    expect((await lists.getListWithEffectiveStatuses(auto.id)).items).toMatchObject([
      {label: 'Żurek domowy', currentQuantity: 1, missingQuantity: 2},
    ]);
    expect((await lists.getListWithEffectiveStatuses(manual.id)).items).toMatchObject([
      {label: 'Zupa na obiad', currentQuantity: 1, missingQuantity: 1},
    ]);
    expect(await lists.generateReplenishmentSuggestions()).toMatchObject([
      {catalogProductId: product.id, name: 'Żurek domowy', currentQuantity: 1, missingQuantity: 2},
    ]);
  });

  it('keeps specific variants counted under a renamed generic parent', async () => {
    const parent = await createProduct('generic');
    const variant = await createProduct('specific');
    renameProduct(variant, 'Zupa w butelce');
    db.execute('UPDATE product_catalog SET parent_catalog_product_id = ? WHERE id = ?', [parent.id, variant.id]);
    await products.addToInventory('variant-copy', variant.productEan, null, null);
    const list = await shopping.createList('Minimum', 'auto');
    await shopping.addItem(list.id, {catalogProductId: parent.id, label: parent.name, quantity: 2});
    renameProduct(parent, 'Żurek domowy');

    const lists = new ShoppingList(shopping, products);

    expect((await lists.getListWithEffectiveStatuses(list.id)).items).toMatchObject([
      {label: 'Żurek domowy', currentQuantity: 1, missingQuantity: 1},
    ]);
    expect(await lists.generateReplenishmentSuggestions()).toMatchObject([
      {catalogProductId: parent.id, currentQuantity: 1, missingQuantity: 1},
    ]);
  });

  it.each([
    ['generic', 'direct'],
    ['specific', 'direct'],
    ['generic', 'alternative'],
    ['specific', 'alternative'],
  ] as const)('stores stable links for a %s purchase with a %s catalog association', async (kind, association) => {
    const product = await createProduct(kind);
    const list = await shopping.createList('Zakupy', 'manual');
    const item = await shopping.addItem(list.id, {
      catalogProductId: association === 'direct' ? product.id : null,
      label: 'Zupa na obiad',
      quantity: 2,
      status: 'purchased',
    });
    if (association === 'alternative') {
      await shopping.linkCatalogProductToItem(item.id, product.id);
    }
    renameProduct(product, 'Żurek domowy');

    const result = await shopping.completePurchase(list.id, {[item.id]: '2999-01-01'});
    expect(result.inventoryIds).toHaveLength(2);
    await products.markAsOpened(result.inventoryIds[0], '2026-10-20T09:30:00.000Z');
    renameProduct(product, 'Żurek na zakwasie');
    sqlite.reopen();
    setupDatabase();

    const items = await products.getFullInventory();
    expect(items).toHaveLength(2);
    for (const copy of items) {
      expect(copy).toMatchObject({
        ...metadata,
        name: 'Żurek na zakwasie',
        ean: product.productEan ?? '',
        catalogProductId: product.id,
        expiryDate: '2999-01-01',
        isOpened: copy.id === result.inventoryIds[0],
        openedAt: copy.id === result.inventoryIds[0] ? '2026-10-20T09:30:00.000Z' : null,
      });
    }
    expect((await shopping.getItems(list.id))[0].label)
      .toBe(association === 'direct' ? 'Żurek na zakwasie' : 'Zupa na obiad');
  });

  it.each(['no alternatives', 'ambiguous generic alternatives', 'ambiguous specific alternatives'])(
    'keeps purchased text unlinked with %s even when its label matches a catalog product',
    async scenario => {
      const first = await createProduct(scenario === 'ambiguous specific alternatives' ? 'specific' : 'generic');
      const second = await products.saveGenericCatalogProduct({name: 'Inna zupa'});
      if (scenario === 'ambiguous specific alternatives') {
        await products.saveDefinition({ean: '5901111111111', name: 'Inna zupa'});
      }
      const list = await shopping.createList('Zakupy', 'manual');
      const label = metadata.name.toLowerCase();
      const item = await shopping.addItem(list.id, {label, status: 'purchased'});
      if (scenario !== 'no alternatives') {
        await shopping.linkCatalogProductToItem(item.id, first.id);
        const alternative = scenario === 'ambiguous specific alternatives'
          ? (await products.findCatalogProductByEan('5901111111111'))!
          : second;
        await shopping.linkCatalogProductToItem(item.id, alternative.id);
      }

      await shopping.completePurchase(list.id);
      const expected = [
        expect.objectContaining({
          name: label, ean: '', catalogProductId: null,
          brand: null, category: null, imageUrl: null,
        }),
      ];
      expect(await products.getFullInventory()).toEqual(expected);

      renameProduct(first, 'Żurek domowy');
      expect(await products.getFullInventory()).toEqual(expected);
    },
  );

  it('preserves the existing preference for one specific alternative among generic alternatives', async () => {
    const specific = await createProduct('specific');
    const generic = await products.saveGenericCatalogProduct({name: 'Zupa'});
    const list = await shopping.createList('Zakupy', 'manual');
    const item = await shopping.addItem(list.id, {label: 'Zupa na obiad', status: 'purchased'});
    await shopping.linkCatalogProductToItem(item.id, generic.id);
    await shopping.linkCatalogProductToItem(item.id, specific.id);

    await shopping.completePurchase(list.id);

    expect(await products.getFullInventory()).toEqual([
      expect.objectContaining({catalogProductId: specific.id, ean: specific.productEan}),
    ]);
  });
});
