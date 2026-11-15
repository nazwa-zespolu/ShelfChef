import {sqlite} from '../helpers/sqlite';

jest.mock('react-native-quick-sqlite', () => ({open: () => sqlite}), {virtual: true});

import {ScanToAdd} from '../../src/app/ScanToAdd';
import {ProductRepository} from '../../src/infrastructure/ProductRepository';
import {ScanToAddDatabaseAdapter} from '../../src/infrastructure/ScanToAddDatabaseAdapter';
import {ShoppingListRepository} from '../../src/infrastructure/ShoppingListRepository';
import {db, setupDatabase} from '../../src/infrastructure/db/init';
import {ProductDefinition} from '../../src/domain/types';

describe('Adding copies of an existing EAN', () => {
  let products: ProductRepository;
  const original: ProductDefinition = {
    ean: '5901234123457', name: 'Żurek', brand: 'Spichlerz', category: 'Zupy',
    imageUrl: 'file:///photos/soup.jpg',
    dietary: {isVegetarian: true, isVegan: false, isGlutenFree: false, isLactoseFree: true},
  };
  const rows = (table: string) => {
    const result = db.execute(`SELECT * FROM ${table} ORDER BY rowid`).rows!;
    return Array.from({length: result.length}, (_, index) => result.item(index));
  };

  beforeEach(() => {
    sqlite.reset();
    setupDatabase();
    products = new ProductRepository();
  });
  afterAll(() => sqlite.close());

  it('preserves edited definitions, photos, dietary flags, instance state and shopping links after reopening', async () => {
    await products.saveDefinition(original);
    const catalog = (await products.findCatalogProductByEan(original.ean))!;
    await products.updateCatalogProduct(catalog.id, {name: 'Żurek domowy', brand: null, category: 'Dania gotowe'});
    const parent = await products.saveGenericCatalogProduct({name: 'Zupa'});
    db.execute('UPDATE product_catalog SET parent_catalog_product_id = ? WHERE id = ?', [parent.id, catalog.id]);
    await products.addToInventory('opened-copy', original.ean, null, '2999-01-01');
    await products.addToInventory('closed-copy', original.ean, null, null);
    await products.markAsOpened('opened-copy', '2026-10-20T09:30:00.000Z');
    const shopping = new ShoppingListRepository();
    const list = await shopping.createList('Zakupy', 'manual');
    await shopping.addItem(list.id, {label: 'Zupa', catalogProductId: catalog.id});
    const alternative = await shopping.addItem(list.id, {label: 'Zupa na obiad'});
    await shopping.linkCatalogProductToItem(alternative.id, catalog.id);
    const definitionsBefore = rows('product_definitions');
    const catalogBefore = rows('product_catalog');
    const inventoryBefore = rows('inventory');
    const shoppingBefore = rows('shopping_list_items');
    const linksBefore = rows('shopping_list_item_catalog_products');

    await products.saveDefinition({
      ...original, name: 'Nieaktualna nazwa', brand: 'Inna marka', category: 'Inna kategoria',
      imageUrl: 'file:///photos/other.jpg',
      dietary: {isVegetarian: false, isVegan: false, isGlutenFree: true, isLactoseFree: false},
    });
    await products.saveDefinition({ean: original.ean, name: 'Jeszcze inna nazwa'});
    await products.addToInventory('new-copy-1', original.ean, null, '2999-02-01');
    await products.addToInventory('new-copy-2', original.ean, null, '2999-02-01');
    sqlite.reopen();
    setupDatabase();

    expect(rows('product_definitions')).toEqual(definitionsBefore);
    expect(rows('product_catalog')).toEqual(catalogBefore);
    expect(rows('shopping_list_items')).toEqual(shoppingBefore);
    expect(rows('shopping_list_item_catalog_products')).toEqual(linksBefore);
    expect(rows('inventory').slice(0, 2)).toEqual(inventoryBefore);
    const inventory = await products.getFullInventory();
    expect(inventory).toHaveLength(4);
    for (const copy of inventory) {
      expect(copy).toMatchObject({
        name: 'Żurek domowy', brand: null, category: 'Dania gotowe', imageUrl: original.imageUrl,
        catalogProductId: catalog.id, ean: original.ean,
      });
    }
    expect(inventory.filter(copy => copy.id.startsWith('new-copy'))).toEqual([
      expect.objectContaining({expiryDate: '2999-02-01', isOpened: false, openedAt: null}),
      expect.objectContaining({expiryDate: '2999-02-01', isOpened: false, openedAt: null}),
    ]);
  });

  it('keeps the first definition when saves for the same new EAN overlap', async () => {
    await Promise.all([
      products.saveDefinition(original),
      products.saveDefinition({...original, name: 'Other product', imageUrl: 'file:///other.jpg'}),
    ]);
    sqlite.reopen();
    setupDatabase();

    expect(await products.findDefinitionByEan(original.ean)).toEqual(original);
    expect(await products.getCatalogProducts()).toMatchObject([{name: original.name, imageUrl: original.imageUrl}]);
    expect(rows('product_definitions')).toHaveLength(1);
    expect(rows('product_catalog')).toHaveLength(1);
  });

  it('returns local data when an OFF response arrives after a local product was saved', async () => {
    let resolveFetch!: (definition: ProductDefinition) => void;
    const fetchProductByEAN = jest.fn(() => new Promise<ProductDefinition>(resolve => { resolveFetch = resolve; }));
    const scanner = new ScanToAdd(new ScanToAddDatabaseAdapter(products), {fetchProductByEAN});
    const pending = scanner.execute({ean: original.ean});
    await Promise.resolve();
    expect(fetchProductByEAN).toHaveBeenCalledTimes(1);
    await products.saveDefinition(original);

    resolveFetch({...original, name: 'Remote product', imageUrl: 'https://remote/photo.jpg'});
    expect(await pending).toEqual(original);
    sqlite.reopen();
    setupDatabase();
    expect(await products.findDefinitionByEan(original.ean)).toEqual(original);
    expect(await products.findCatalogProductByEan(original.ean)).toMatchObject({name: original.name, imageUrl: original.imageUrl});
  });
});
