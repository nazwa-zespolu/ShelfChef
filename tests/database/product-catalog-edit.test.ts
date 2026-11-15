import {sqlite} from '../helpers/sqlite';

jest.mock('react-native-quick-sqlite', () => ({open: () => sqlite}), {virtual: true});

import {ShoppingList} from '../../src/app/ShoppingList';
import {ProductRepository} from '../../src/infrastructure/ProductRepository';
import {ShoppingListRepository} from '../../src/infrastructure/ShoppingListRepository';
import {db, setupDatabase} from '../../src/infrastructure/db/init';

describe('Local product catalog queries and editing', () => {
  let products: ProductRepository;
  let shopping: ShoppingListRepository;
  const original = {
    name: 'Żurek', brand: 'Domowa kuchnia', category: 'Zupy', imageUrl: 'file:///photos/soup.jpg',
  };
  const changes = {name: '  Żurek domowy  ', brand: '  Spichlerz  ', category: '  Dania gotowe  '};
  const dietary = {isVegetarian: true, isVegan: false, isGlutenFree: false, isLactoseFree: true};

  beforeEach(() => {
    sqlite.reset();
    setupDatabase();
    products = new ProductRepository();
    shopping = new ShoppingListRepository();
  });

  afterAll(() => sqlite.close());

  const createProduct = async (kind: 'generic' | 'specific') => {
    if (kind === 'generic') {
      return products.saveGenericCatalogProduct(original);
    }
    await products.saveDefinition({...original, ean: '5901234123457', dietary});
    return (await products.findCatalogProductByEan('5901234123457'))!;
  };

  const tableRows = (table: string) => {
    const rows = db.execute(`SELECT * FROM ${table} ORDER BY rowid`).rows!;
    return Array.from({length: rows.length}, (_, index) => rows.item(index));
  };

  it('lists and searches the entire catalog independently of inventory and keeps shopping suggestions limited', async () => {
    const generic = await createProduct('generic');
    const specific = await createProduct('specific');
    for (let index = 0; index < 25; index++) {
      await products.saveGenericCatalogProduct({name: `Produkt ${String(index).padStart(2, '0')}`});
    }
    sqlite.reopen();
    setupDatabase();

    const all = await products.getCatalogProducts();
    expect(all).toHaveLength(27);
    expect(await products.searchCatalogProducts('  ')).toEqual(all);
    expect(await shopping.getCatalogProducts()).toEqual(all);
    expect(await products.getFullInventory()).toEqual([]);
    expect(await products.findCatalogProductById(generic.id)).toEqual(generic);
    expect(await products.findCatalogProductById('missing')).toBeNull();
    expect((await products.searchCatalogProducts(' ŻUREK ')).map(product => product.id))
      .toEqual([generic.id, specific.id]);
    expect((await products.searchCatalogProducts(' 341234 ')).map(product => product.id))
      .toEqual([specific.id]);
    expect((await shopping.searchCatalogProducts('590123')).map(product => product.id))
      .toEqual([specific.id]);
    expect(await products.searchCatalogProducts('Produkt')).toHaveLength(25);
    expect(await shopping.searchCatalogProducts('Produkt')).toHaveLength(20);
    expect(await products.searchCatalogProducts('not present')).toEqual([]);
  });

  it.each(['%', '_', '\\', "'"])(
    'treats the search character %s literally',
    async character => {
      const match = await products.saveGenericCatalogProduct({name: `Sok ${character} jabłkowy`});
      await products.saveGenericCatalogProduct({name: 'Sok jabłkowy'});

      expect((await products.searchCatalogProducts(character)).map(product => product.id)).toEqual([match.id]);
      expect((await shopping.searchCatalogProducts(character)).map(product => product.id)).toEqual([match.id]);
    },
  );

  it.each(['generic', 'specific'] as const)(
    'persists a %s edit for all copies and shopping links without changing inventory records',
    async kind => {
      const product = await createProduct(kind);
      const parent = await products.saveGenericCatalogProduct({name: 'Zupa'});
      if (kind === 'specific') {
        db.execute('UPDATE product_catalog SET parent_catalog_product_id = ? WHERE id = ?', [parent.id, product.id]);
      }
      await products.addToInventory('opened-copy', product.productEan, original.name, '2999-01-01', product.id);
      await products.addToInventory('closed-copy', product.productEan, original.name, null, product.id);
      await products.markAsOpened('opened-copy', '2026-10-20T09:30:00.000Z');
      const inventoryBefore = tableRows('inventory');
      const manual = await shopping.createList('Zakupy', 'manual');
      await shopping.addItem(manual.id, {label: original.name, catalogProductId: product.id});
      const auto = await shopping.createList('Minimum', 'auto');
      const text = await shopping.addItem(auto.id, {label: 'Zupa na obiad', quantity: 3});
      await shopping.linkCatalogProductToItem(text.id, product.id);
      const linksBefore = tableRows('shopping_list_item_catalog_products');

      const updated = await products.updateCatalogProduct(product.id, changes);
      sqlite.reopen();
      setupDatabase();

      const expected = {
        ...original, id: product.id, name: 'Żurek domowy', normalizedName: 'żurek domowy',
        brand: 'Spichlerz', category: 'Dania gotowe', productEan: product.productEan,
        kind, parentCatalogProductId: kind === 'specific' ? parent.id : null, createdAt: product.createdAt,
      };
      expect(updated).toMatchObject(expected);
      expect(await products.findCatalogProductById(product.id)).toEqual(updated);
      expect(await shopping.findCatalogProductById(product.id)).toEqual(updated);
      expect((await products.searchCatalogProducts('ŻUREK DOMOWY')).map(item => item.id)).toEqual([product.id]);
      expect(await products.searchCatalogProducts('Żurek')).toEqual([updated]);
      expect(await products.findCatalogProductByNormalizedName(kind, 'żurek')).toBeNull();
      expect(await products.findCatalogProductByNormalizedName(kind, 'żurek domowy')).toEqual(updated);
      expect(tableRows('inventory')).toEqual(inventoryBefore);
      expect(tableRows('shopping_list_item_catalog_products')).toEqual(linksBefore);
      for (const item of await products.getFullInventory()) {
        expect(item).toMatchObject({
          name: expected.name, brand: expected.brand, category: expected.category,
          imageUrl: original.imageUrl, catalogProductId: product.id,
        });
      }
      expect((await shopping.getItems(manual.id))[0].label).toBe('Żurek domowy');
      expect((await shopping.getItems(auto.id))[0]).toMatchObject({
        label: 'Zupa na obiad', linkedCatalogProducts: [expected],
      });
      expect((await new ShoppingList(shopping, products).getListWithEffectiveStatuses(auto.id)).items)
        .toMatchObject([{currentQuantity: 2, missingQuantity: 1}]);
      if (product.productEan) {
        expect(await products.findDefinitionByEan(product.productEan)).toMatchObject({
          name: expected.name, brand: expected.brand, category: expected.category,
          imageUrl: original.imageUrl, dietary,
        });
      }
    },
  );

  it.each(['generic', 'specific'] as const)('allows clearing optional metadata for a %s product', async kind => {
    const product = await createProduct(kind);

    const updated = await products.updateCatalogProduct(product.id, {name: product.name, brand: '  ', category: null});
    sqlite.reopen();
    setupDatabase();

    expect(updated).toMatchObject({brand: null, category: null, imageUrl: original.imageUrl});
    expect(await products.findCatalogProductById(product.id)).toEqual(updated);
    if (product.productEan) {
      expect(await products.findDefinitionByEan(product.productEan)).toMatchObject({brand: null, category: null, dietary});
    }
  });

  it('accepts only editable shared fields and preserves EAN and identity', async () => {
    const product = await createProduct('specific');
    const input = {
      ...changes, ean: 'changed-ean', productEan: 'changed-ean', id: 'changed-id', kind: 'generic',
      imageUrl: 'file:///photos/changed.jpg', expiryDate: '2000-01-01', openedAt: null,
    };

    const updated = await products.updateCatalogProduct(product.id, input);

    expect(updated).toMatchObject({
      id: product.id, productEan: product.productEan, kind: 'specific', imageUrl: input.imageUrl,
    });
    expect(await products.findDefinitionByEan(product.productEan!)).toMatchObject({imageUrl: input.imageUrl, dietary});
  });

  it.each(['', '  \n\t '])('rejects an empty product name: %j', async name => {
    const product = await createProduct('generic');

    await expect(products.updateCatalogProduct(product.id, {...changes, name})).rejects.toMatchObject({code: 'empty_name'});

    expect(await products.findCatalogProductById(product.id)).toEqual(product);
  });

  it('reports a missing product without changing catalog data', async () => {
    const product = await createProduct('generic');

    await expect(products.updateCatalogProduct('missing', changes)).rejects.toMatchObject({code: 'not_found'});

    expect(await products.getCatalogProducts()).toEqual([product]);
  });

  it('rejects a normalized generic name collision without merging products or changing their links', async () => {
    const first = await createProduct('generic');
    const other = await products.saveGenericCatalogProduct({name: 'Żurek domowy'});
    await products.addToInventory('first-copy', null, first.name, null, first.id);
    await products.addToInventory('other-copy', null, other.name, null, other.id);
    const inventoryBefore = tableRows('inventory');

    await expect(products.updateCatalogProduct(first.id, {...changes, name: '  ŻUREK DOMOWY  '}))
      .rejects.toMatchObject({code: 'duplicate_name'});

    expect(await products.findCatalogProductById(first.id)).toEqual(first);
    expect(await products.findCatalogProductById(other.id)).toEqual(other);
    expect(tableRows('inventory')).toEqual(inventoryBefore);
  });

  it('allows specific products to share names with generic products and other EANs', async () => {
    const generic = await products.saveGenericCatalogProduct({name: 'Zupa'});
    const specific = await createProduct('specific');
    await products.saveDefinition({ean: '5901111111111', name: generic.name});

    await products.updateCatalogProduct(specific.id, {...changes, name: generic.name});

    expect(await products.searchCatalogProducts('Zupa')).toHaveLength(3);
  });

  it('rolls back both sides of a specific edit on a catalog write failure and supports retry', async () => {
    const product = await createProduct('specific');
    const definitionsBefore = tableRows('product_definitions');
    const catalogBefore = tableRows('product_catalog');
    db.execute(`CREATE TRIGGER fail_catalog_update BEFORE UPDATE ON product_catalog
      BEGIN SELECT RAISE(ABORT, 'test catalog update failure'); END`);

    await expect(products.updateCatalogProduct(product.id, changes)).rejects.toThrow('test catalog update failure');

    expect(tableRows('product_definitions')).toEqual(definitionsBefore);
    expect(tableRows('product_catalog')).toEqual(catalogBefore);
    db.execute('DROP TRIGGER fail_catalog_update');
    expect(await products.updateCatalogProduct(product.id, changes)).toMatchObject({name: 'Żurek domowy'});
  });

  it.each(['INSERT', 'UPDATE'])(
    'keeps definition saves consistent when catalog %s is rejected',
    async operation => {
      if (operation === 'UPDATE') {
        await createProduct('specific');
      }
      const definitionsBefore = tableRows('product_definitions');
      const catalogBefore = tableRows('product_catalog');
      db.execute(`CREATE TRIGGER fail_catalog_save BEFORE ${operation} ON product_catalog
        BEGIN SELECT RAISE(ABORT, 'test catalog save failure'); END`);
      const definition = {...original, ean: '5901234123457', name: 'Żurek domowy'};

      if (operation === 'INSERT') {
        await expect(products.saveDefinition(definition)).rejects.toThrow('test catalog save failure');
      } else {
        // Repeated adds must not execute any shared catalog update.
        await products.saveDefinition(definition);
      }

      expect(tableRows('product_definitions')).toEqual(definitionsBefore);
      expect(tableRows('product_catalog')).toEqual(catalogBefore);
      db.execute('DROP TRIGGER fail_catalog_save');
      await products.saveDefinition(definition);
      const expected = operation === 'INSERT' ? definition : {...original, ean: definition.ean};
      expect(await products.findDefinitionByEan(definition.ean)).toMatchObject(expected);
      expect(await products.findCatalogProductByEan(definition.ean)).toMatchObject({name: expected.name});
    },
  );
});
