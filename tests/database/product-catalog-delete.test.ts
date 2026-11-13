import {sqlite} from '../helpers/sqlite';

jest.mock('react-native-quick-sqlite', () => ({open: () => sqlite}), {virtual: true});

import {ProductRepository} from '../../src/infrastructure/ProductRepository';
import {ShoppingListRepository} from '../../src/infrastructure/ShoppingListRepository';
import {db, setupDatabase} from '../../src/infrastructure/db/init';

describe('Local product catalog deletion', () => {
  let products: ProductRepository;
  let shopping: ShoppingListRepository;
  const metadata = {name: 'Żurek', brand: 'Spichlerz', category: 'Zupy', imageUrl: 'file:///photos/soup.jpg'};
  const ean = '5901234123457';

  beforeEach(() => {
    sqlite.reset();
    setupDatabase();
    products = new ProductRepository();
    shopping = new ShoppingListRepository();
  });

  afterAll(() => sqlite.close());

  const createProduct = async (kind: 'generic' | 'specific') => {
    if (kind === 'generic') {
      return products.saveGenericCatalogProduct(metadata);
    }
    await products.saveDefinition({...metadata, ean});
    return (await products.findCatalogProductByEan(ean))!;
  };
  const snapshot = () => Object.fromEntries([
    'product_definitions', 'product_catalog', 'inventory', 'shopping_lists',
    'shopping_list_items', 'shopping_list_item_catalog_products',
  ].map(table => {
    const rows = db.execute(`SELECT * FROM ${table} ORDER BY rowid`).rows!;
    return [table, Array.from({length: rows.length}, (_, index) => rows.item(index))];
  }));

  it.each(['generic', 'specific'] as const)(
    'deletes an unused %s product durably without changing unrelated data and allows adding it again',
    async kind => {
      const product = await createProduct(kind);
      const other = await products.saveGenericCatalogProduct({name: 'Mleko', imageUrl: metadata.imageUrl});
      await products.addToInventory('other-copy', null, other.name, '2999-01-01', other.id);
      await products.markAsOpened('other-copy', '2026-10-20T09:30:00.000Z');
      const list = await shopping.createList('Zakupy', 'manual');
      await shopping.addItem(list.id, {label: other.name, catalogProductId: other.id});
      const before = snapshot();
      // Deletion order must also be valid when FK enforcement is enabled.
      db.execute('PRAGMA foreign_keys = ON');

      await products.deleteCatalogProduct(product.id);
      sqlite.reopen();
      setupDatabase();

      expect(await products.findCatalogProductById(product.id)).toBeNull();
      expect(await products.searchCatalogProducts(product.name)).toEqual([]);
      expect(await products.findCatalogProductByEan(ean)).toBeNull();
      expect(await products.findDefinitionByEan(ean)).toBeNull();
      expect(await shopping.getCatalogProducts()).toEqual([other]);
      expect(snapshot()).toEqual({
        ...before, product_definitions: [],
        product_catalog: before.product_catalog.filter(row => row.id !== product.id),
      });

      const recreated = await createProduct(kind);
      expect(recreated).toMatchObject({...metadata, kind});
      if (kind === 'specific') {
        expect(await products.findDefinitionByEan(ean)).toMatchObject({...metadata, ean});
      }
    },
  );

  it.each(['generic', 'specific'] as const)('preserves all data when a %s product has inventory copies', async kind => {
    const product = await createProduct(kind);
    await products.addToInventory('opened-copy', product.productEan, product.name, '2999-01-01', product.id);
    await products.markAsOpened('opened-copy', '2026-10-20T09:30:00.000Z');
    const before = snapshot();

    await expect(products.deleteCatalogProduct(product.id)).rejects.toMatchObject({code: 'in_inventory'});
    sqlite.reopen();
    setupDatabase();

    expect(snapshot()).toEqual(before);
    expect(await products.findCatalogProductById(product.id)).toEqual(product);
  });

  it('protects an EAN referenced by an inventory row without a catalog ID', async () => {
    const product = await createProduct('specific');
    await products.addToInventory('legacy-copy', ean, product.name, null, product.id);
    db.execute('UPDATE inventory SET catalog_product_id = NULL WHERE id = ?', ['legacy-copy']);
    const before = snapshot();

    await expect(products.deleteCatalogProduct(product.id)).rejects.toMatchObject({code: 'in_inventory'});

    expect(snapshot()).toEqual(before);
  });

  it.each(['generic', 'specific'] as const)(
    'blocks deletion of a %s product linked directly to a shopping item in any status',
    async kind => {
      const product = await createProduct(kind);
      const list = await shopping.createList('Zakupy', 'manual');
      const item = await shopping.addItem(list.id, {label: product.name, catalogProductId: product.id});
      for (const status of ['planned', 'purchased', 'stored']) {
        db.execute('UPDATE shopping_list_items SET status = ? WHERE id = ?', [status, item.id]);
        const before = snapshot();

        await expect(products.deleteCatalogProduct(product.id)).rejects.toMatchObject({code: 'in_shopping_list'});

        expect(snapshot()).toEqual(before);
      }
      await shopping.deleteItem(item.id);
      await products.deleteCatalogProduct(product.id);
      expect(await products.findCatalogProductById(product.id)).toBeNull();
    },
  );

  it.each(['generic', 'specific'] as const)('protects a %s shopping alternative until it is unlinked', async kind => {
    const product = await createProduct(kind);
    const list = await shopping.createList('Minimum', 'auto');
    const item = await shopping.addItem(list.id, {label: 'Zupa na obiad'});
    await shopping.linkCatalogProductToItem(item.id, product.id);
    const before = snapshot();

    await expect(products.deleteCatalogProduct(product.id)).rejects.toMatchObject({code: 'in_shopping_list'});

    expect(snapshot()).toEqual(before);
    await shopping.unlinkCatalogProductFromItem(item.id, product.id);
    const unlinked = snapshot();
    await products.deleteCatalogProduct(product.id);
    expect(snapshot().shopping_list_items).toEqual(unlinked.shopping_list_items);
  });

  it('protects a catalog parent until its children are unlinked and preserves the child afterward', async () => {
    const parent = await createProduct('generic');
    const child = await createProduct('specific');
    db.execute('UPDATE product_catalog SET parent_catalog_product_id = ? WHERE id = ?', [parent.id, child.id]);
    const before = snapshot();

    await expect(products.deleteCatalogProduct(parent.id)).rejects.toMatchObject({code: 'has_children'});

    expect(snapshot()).toEqual(before);
    db.execute('UPDATE product_catalog SET parent_catalog_product_id = NULL WHERE id = ?', [child.id]);
    await products.deleteCatalogProduct(parent.id);
    expect(await products.findCatalogProductById(child.id)).toEqual(child);
    expect(await products.findDefinitionByEan(ean)).toMatchObject({...metadata, ean});
  });

  it('allows deleting an unused child without changing its parent', async () => {
    const parent = await createProduct('generic');
    const child = await createProduct('specific');
    db.execute('UPDATE product_catalog SET parent_catalog_product_id = ? WHERE id = ?', [parent.id, child.id]);

    await products.deleteCatalogProduct(child.id);

    expect(await products.getCatalogProducts()).toEqual([parent]);
    expect(await products.findDefinitionByEan(ean)).toBeNull();
  });

  it('reports a missing product without changing other data', async () => {
    await createProduct('specific');
    const before = snapshot();

    await expect(products.deleteCatalogProduct('missing')).rejects.toMatchObject({code: 'not_found'});

    expect(snapshot()).toEqual(before);
  });

  it('rolls back catalog deletion if deleting the definition fails and allows retry', async () => {
    const product = await createProduct('specific');
    const before = snapshot();
    db.execute(`CREATE TRIGGER fail_definition_delete BEFORE DELETE ON product_definitions
      BEGIN SELECT RAISE(ABORT, 'test definition deletion failure'); END`);

    await expect(products.deleteCatalogProduct(product.id)).rejects.toThrow('test definition deletion failure');
    expect(snapshot()).toEqual(before);
    sqlite.reopen();
    setupDatabase();

    expect(snapshot()).toEqual(before);
    db.execute('DROP TRIGGER fail_definition_delete');
    await products.deleteCatalogProduct(product.id);
    expect(await products.findCatalogProductById(product.id)).toBeNull();
    expect(await products.findDefinitionByEan(ean)).toBeNull();
  });
});
