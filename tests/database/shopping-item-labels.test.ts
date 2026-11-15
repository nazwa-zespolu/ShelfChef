import {sqlite} from '../helpers/sqlite';

jest.mock('react-native-quick-sqlite', () => ({open: () => sqlite}), {
  virtual: true,
});

import {ShoppingItemStatus, ShoppingSuggestion} from '../../src/domain/types';
import {ProductRepository} from '../../src/infrastructure/ProductRepository';
import {ShoppingListRepository} from '../../src/infrastructure/ShoppingListRepository';
import {db, setupDatabase} from '../../src/infrastructure/db/init';

describe('Shopping item labels and catalog names', () => {
  let products: ProductRepository;
  let shopping: ShoppingListRepository;
  const original = {
    name: 'Jogurt',
    brand: 'Mleczarnia',
    category: 'Nabiał',
    imageUrl: 'file:///photos/yogurt.jpg',
  };
  const changes = {
    name: '  Jogurt naturalny  ',
    brand: 'Mleczarnia',
    category: 'Nabiał',
  };
  const rows = (table: string) => {
    const result = db.execute(`SELECT * FROM ${table} ORDER BY rowid`).rows!;
    return Array.from({length: result.length}, (_, index) =>
      result.item(index)
    );
  };
  const createProduct = async (kind: 'generic' | 'specific') => {
    if (kind === 'generic') {
      return products.saveGenericCatalogProduct(original);
    }
    await products.saveDefinition({...original, ean: '5901234123457'});
    return (await products.findCatalogProductByEan('5901234123457'))!;
  };

  beforeEach(() => {
    sqlite.reset();
    setupDatabase();
    products = new ProductRepository();
    shopping = new ShoppingListRepository();
  });
  afterAll(() => sqlite.close());

  it.each(['generic', 'specific'] as const)(
    'persists a %s rename in direct labels across lists and statuses while preserving text and alternative labels',
    async (kind) => {
      const product = await createProduct(kind);
      const other = await createProduct(
        kind === 'generic' ? 'specific' : 'generic'
      );
      const listIds: string[] = [];
      for (const type of ['manual', 'auto'] as const) {
        const list = await shopping.createList('Zakupy', type);
        listIds.push(list.id);
        for (const status of [
          'planned',
          'purchased',
          'stored',
        ] as ShoppingItemStatus[]) {
          await shopping.addItem(list.id, {
            catalogProductId: product.id,
            label: original.name,
            quantity: 2,
            status,
          });
        }
        const text = await shopping.addItem(list.id, {label: original.name});
        await shopping.linkCatalogProductToItem(text.id, product.id);
        const custom = await shopping.addItem(list.id, {
          label: 'Jogurt na śniadanie',
        });
        await shopping.linkCatalogProductToItem(custom.id, product.id);
        await shopping.addItem(list.id, {label: original.name});
        await shopping.addItem(list.id, {
          catalogProductId: other.id,
          label: original.name,
        });
      }
      db.execute('UPDATE shopping_list_items SET updated_at = ?', [
        '2000-01-01T00:00:00.000Z',
      ]);
      const before = rows('shopping_list_items');
      const linksBefore = rows('shopping_list_item_catalog_products');

      await products.updateCatalogProduct(product.id, changes);
      sqlite.reopen();
      setupDatabase();

      const after = rows('shopping_list_items');
      expect(after).toHaveLength(before.length);
      for (const row of after) {
        const previous = before.find((item) => item.id === row.id)!;
        if (row.catalog_product_id === product.id) {
          expect(row.label).toBe('Jogurt naturalny');
          expect(row.updated_at).not.toBe(previous.updated_at);
          expect({
            ...row,
            label: previous.label,
            updated_at: previous.updated_at,
          }).toEqual(previous);
        } else {
          expect(row).toEqual(previous);
        }
      }
      expect(rows('shopping_list_item_catalog_products')).toEqual(linksBefore);
      for (const listId of listIds) {
        for (const item of await shopping.getItems(listId)) {
          const previous = before.find((row) => row.id === item.id)!;
          expect(item.label).toBe(
            item.catalogProductId === product.id
              ? 'Jogurt naturalny'
              : previous.label
          );
          if (
            item.linkedCatalogProducts.some((link) => link.id === product.id)
          ) {
            expect(item.linkedCatalogProducts[0].name).toBe('Jogurt naturalny');
          }
        }
      }
    }
  );

  it.each(['generic', 'specific'] as const)(
    'rolls back the %s catalog and all labels when a later shopping-label update fails',
    async (kind) => {
      const product = await createProduct(kind);
      for (const type of ['manual', 'auto'] as const) {
        const list = await shopping.createList('Zakupy', type);
        await shopping.addItem(list.id, {
          catalogProductId: product.id,
          label: original.name,
        });
      }
      const catalogBefore = rows('product_catalog');
      const definitionsBefore = rows('product_definitions');
      const itemsBefore = rows('shopping_list_items');
      db.execute(`CREATE TRIGGER fail_second_label_update BEFORE UPDATE OF label ON shopping_list_items
        WHEN (SELECT COUNT(*) FROM shopping_list_items WHERE label = 'Jogurt naturalny') >= 1
        BEGIN SELECT RAISE(ABORT, 'shopping label update failed'); END`);

      await expect(
        products.updateCatalogProduct(product.id, changes)
      ).rejects.toThrow('shopping label update failed');
      sqlite.reopen();
      setupDatabase();
      expect(rows('product_catalog')).toEqual(catalogBefore);
      expect(rows('product_definitions')).toEqual(definitionsBefore);
      expect(rows('shopping_list_items')).toEqual(itemsBefore);
    }
  );

  it.each(['generic', 'specific'] as const)(
    'maps the current %s name and photo even if the stored direct label is stale',
    async (kind) => {
      const product = await createProduct(kind);
      const list = await shopping.createList('Zakupy', 'manual');
      const item = await shopping.addItem(list.id, {
        catalogProductId: product.id,
        label: 'Stara etykieta',
      });
      const text = await shopping.addItem(list.id, {label: 'Własna nazwa'});
      await shopping.linkCatalogProductToItem(text.id, product.id);
      sqlite.reopen();
      setupDatabase();

      expect(await shopping.getItems(list.id)).toMatchObject([
        {id: item.id, label: original.name, imageUrl: original.imageUrl},
        {
          id: text.id,
          label: 'Własna nazwa',
          imageUrl: null,
          linkedCatalogProducts: [{name: original.name}],
        },
      ]);
    }
  );

  it('does not touch shopping labels or timestamps when only product metadata changes', async () => {
    const product = await createProduct('generic');
    const list = await shopping.createList('Zakupy', 'manual');
    await shopping.addItem(list.id, {
      catalogProductId: product.id,
      label: original.name,
    });
    db.execute('UPDATE shopping_list_items SET updated_at = ?', [
      '2000-01-01T00:00:00.000Z',
    ]);
    const before = rows('shopping_list_items');
    await products.updateCatalogProduct(product.id, {
      ...original,
      brand: 'Inna marka',
      category: null,
    });
    sqlite.reopen();
    setupDatabase();
    expect(rows('shopping_list_items')).toEqual(before);
  });

  it.each(['catalog', 'text'] as const)(
    'reactivates the existing %s suggestion target without creating a duplicate',
    async (kind) => {
      const product = await createProduct('generic');
      const list = await shopping.createList('Zakupy', 'manual');
      const item = await shopping.addItem(list.id, {
        label: original.name,
        catalogProductId: kind === 'catalog' ? product.id : null,
        quantity: 1,
        status: 'stored',
      });
      await products.updateCatalogProduct(product.id, changes);
      const suggestion: ShoppingSuggestion = {
        catalogProductId: kind === 'catalog' ? product.id : null,
        linkedCatalogProductIds: kind === 'catalog' ? [] : [product.id],
        name: kind === 'catalog' ? 'Jogurt naturalny' : original.name,
        normalizedName: kind === 'catalog' ? 'jogurt naturalny' : 'jogurt',
        missingQuantity: 3,
        currentQuantity: 0,
        targetQuantity: 3,
        reason: 'Niski stan',
        priority: 'out',
        sourceAutoListIds: [],
        sourceAutoListNames: [],
      };
      expect(
        await shopping.addAllSuggestionsToManualList(list.id, [suggestion])
      ).toEqual({added: 0, reactivated: 1, skipped: 0});
      sqlite.reopen();
      setupDatabase();
      expect(await shopping.getItems(list.id)).toMatchObject([
        {id: item.id, label: suggestion.name, quantity: 3, status: 'planned'},
      ]);
      expect(await shopping.getItems(list.id)).toHaveLength(1);
    }
  );
});
