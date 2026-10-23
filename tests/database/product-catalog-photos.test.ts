import {sqlite} from '../helpers/sqlite';

jest.mock('react-native-quick-sqlite', () => ({open: () => sqlite}), {virtual: true});

import {ProductRepository} from '../../src/infrastructure/ProductRepository';
import {ShoppingListRepository} from '../../src/infrastructure/ShoppingListRepository';
import {db, setupDatabase} from '../../src/infrastructure/db/init';

describe('Catalog product photo editing', () => {
  let products: ProductRepository;
  let shopping: ShoppingListRepository;
  const metadata = {name: 'Żurek', brand: 'Spichlerz', category: 'Zupy'};
  const oldPhoto = 'https://example.test/original.jpg';
  const newPhoto = 'file:///documents/product-photos/new.jpg';
  const dietary = {isVegetarian: true, isVegan: false, isGlutenFree: false, isLactoseFree: true};
  const rows = (table: string) => {
    const result = db.execute(`SELECT * FROM ${table} ORDER BY rowid`).rows!;
    return Array.from({length: result.length}, (_, index) => result.item(index));
  };

  beforeEach(() => {
    sqlite.reset();
    setupDatabase();
    products = new ProductRepository();
    shopping = new ShoppingListRepository();
  });
  afterAll(() => sqlite.close());

  const createProduct = async (kind: 'generic' | 'specific', imageUrl?: string) => {
    if (kind === 'generic') {
      return products.saveGenericCatalogProduct({...metadata, imageUrl});
    }
    await products.saveDefinition({...metadata, imageUrl, ean: '5901234123457', dietary});
    return (await products.findCatalogProductByEan('5901234123457'))!;
  };

  describe.each(['generic', 'specific'] as const)('%s products', kind => {
    it.each(['add', 'replace', 'remove'] as const)(
      'persists a photo %s for all copies and shopping readers without changing links or instance state',
      async operation => {
        const product = await createProduct(kind, operation === 'add' ? undefined : oldPhoto);
        const parent = await products.saveGenericCatalogProduct({name: 'Zupa'});
        if (kind === 'specific') {
          db.execute('UPDATE product_catalog SET parent_catalog_product_id = ? WHERE id = ?', [parent.id, product.id]);
        }
        await products.addToInventory('opened', product.productEan, product.name, '2999-01-01', product.id);
        await products.addToInventory('closed', product.productEan, product.name, null, product.id);
        await products.markAsOpened('opened', '2026-10-20T09:30:00.000Z');
        const list = await shopping.createList('Zakupy', 'manual');
        const direct = await shopping.addItem(list.id, {label: product.name, catalogProductId: product.id});
        const alternative = await shopping.addItem(list.id, {label: 'Zupa na obiad'});
        await shopping.linkCatalogProductToItem(alternative.id, product.id);
        const inventoryBefore = rows('inventory');
        const shoppingBefore = rows('shopping_list_items');
        const linksBefore = rows('shopping_list_item_catalog_products');
        const imageUrl = operation === 'remove' ? null : newPhoto;

        const updated = await products.updateCatalogProduct(product.id, {...metadata, imageUrl});
        if (kind === 'specific') {
          // Adding the same EAN must not restore the previous remote photo.
          await products.saveDefinition({...metadata, ean: product.productEan!, imageUrl: oldPhoto});
        }
        sqlite.reopen();
        setupDatabase();

        const expected = {
          ...metadata, id: product.id, productEan: product.productEan, kind, imageUrl,
          createdAt: product.createdAt, parentCatalogProductId: kind === 'specific' ? parent.id : null,
        };
        expect(updated).toMatchObject(expected);
        expect(await products.findCatalogProductById(product.id)).toMatchObject(expected);
        expect(await products.findCatalogProductByNormalizedName(kind, product.normalizedName)).toMatchObject(expected);
        expect(await products.searchCatalogProducts(product.name)).toMatchObject([expected]);
        expect(await shopping.searchCatalogProducts(product.name)).toMatchObject([expected]);
        const copies = await products.getFullInventory();
        expect(copies).toHaveLength(2);
        expect(copies.every(copy => copy.imageUrl === imageUrl)).toBe(true);
        expect(rows('inventory')).toEqual(inventoryBefore);
        expect(rows('shopping_list_items')).toEqual(shoppingBefore);
        expect(rows('shopping_list_item_catalog_products')).toEqual(linksBefore);
        const items = await shopping.getItems(list.id);
        expect(items.find(item => item.id === direct.id)?.imageUrl).toBe(imageUrl);
        expect(items.find(item => item.id === alternative.id)?.linkedCatalogProducts).toMatchObject([expected]);
        expect(rows('product_catalog').find(row => row.id === product.id)?.image_url).toBe(imageUrl);
        if (kind === 'specific') {
          expect(await products.findDefinitionByEan(product.productEan!)).toMatchObject({...metadata, imageUrl, dietary});
          expect(rows('product_definitions')[0].image_url).toBe(imageUrl);
        }
      },
    );

    it('keeps the current photo when a metadata-only edit omits imageUrl', async () => {
      const product = await createProduct(kind, oldPhoto);

      await products.updateCatalogProduct(product.id, {...metadata, name: 'Żurek domowy'});
      sqlite.reopen();
      setupDatabase();

      expect(await products.findCatalogProductById(product.id)).toMatchObject({name: 'Żurek domowy', imageUrl: oldPhoto});
      if (kind === 'specific') {
        expect(await products.findDefinitionByEan(product.productEan!)).toMatchObject({name: 'Żurek domowy', imageUrl: oldPhoto});
      }
    });
  });

  it.each([newPhoto, null])('rolls back both photo records after a failed catalog update and supports retry: %j', async imageUrl => {
    const product = await createProduct('specific', oldPhoto);
    const definitionsBefore = rows('product_definitions');
    const catalogBefore = rows('product_catalog');
    db.execute(`CREATE TRIGGER fail_photo_update BEFORE UPDATE ON product_catalog
      BEGIN SELECT RAISE(ABORT, 'test photo update failure'); END`);

    await expect(products.updateCatalogProduct(product.id, {...metadata, imageUrl})).rejects.toThrow('test photo update failure');

    expect(rows('product_definitions')).toEqual(definitionsBefore);
    expect(rows('product_catalog')).toEqual(catalogBefore);
    db.execute('DROP TRIGGER fail_photo_update');
    await products.updateCatalogProduct(product.id, {...metadata, imageUrl});
    sqlite.reopen();
    setupDatabase();
    expect(await products.findDefinitionByEan(product.productEan!)).toMatchObject({imageUrl});
    expect(await products.findCatalogProductById(product.id)).toMatchObject({imageUrl});
  });
});
