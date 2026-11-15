import {sqlite} from '../helpers/sqlite';

jest.mock('react-native-quick-sqlite', () => ({open: () => sqlite}), {
  virtual: true,
});

import {ShoppingList} from '../../src/app/ShoppingList';
import {ProductRepository} from '../../src/infrastructure/ProductRepository';
import {ShoppingListRepository} from '../../src/infrastructure/ShoppingListRepository';
import {db, setupDatabase} from '../../src/infrastructure/db/init';

const names = [
  ['Śliwki', 'śliwki'],
  ['ŁOSOŚ', 'łosoś'],
  ['ŻÓŁĆ', 'żółć'],
] as const;

describe('Polish product name normalization with SQLite', () => {
  let products: ProductRepository;
  let shopping: ShoppingListRepository;
  let lists: ShoppingList;
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
    lists = new ShoppingList(shopping, products);
  });
  afterAll(() => sqlite.close());

  it.each(names)(
    'normalizes a backfilled %s definition so %s finds it after reopening',
    async (name, normalized) => {
      db.execute(
        'INSERT INTO product_definitions (ean, name, brand, image_url) VALUES (?, ?, ?, ?)',
        [
          '5901234123457',
          ` \t${name}\u00a0 `,
          'Marka',
          'file:///photos/product.jpg',
        ]
      );
      setupDatabase();
      sqlite.reopen();
      setupDatabase();

      const catalog = (await products.findCatalogProductByEan(
        '5901234123457'
      ))!;
      expect(catalog).toMatchObject({
        id: 'catalog-specific-5901234123457',
        normalizedName: normalized,
        brand: 'Marka',
        imageUrl: 'file:///photos/product.jpg',
      });
      expect(
        await products.findCatalogProductByNormalizedName(
          'specific',
          normalized
        )
      ).toEqual(catalog);
      expect(await products.searchCatalogProducts(normalized)).toEqual([
        catalog,
      ]);
      expect(await shopping.searchCatalogProducts(name)).toEqual([catalog]);
    }
  );

  it('backfills missing definitions without changing existing catalog metadata or identities', async () => {
    await products.saveDefinition({ean: '5901234123457', name: 'Śliwki'});
    const product = (await products.findCatalogProductByEan('5901234123457'))!;
    const parent = await products.saveGenericCatalogProduct({name: 'Owoce'});
    await products.updateCatalogProduct(product.id, {
      name: 'Śliwki suszone',
      brand: 'Sad',
      category: 'Owoce suszone',
      imageUrl: 'file:///photos/plums.jpg',
    });
    db.execute(
      'UPDATE product_catalog SET parent_catalog_product_id = ?, created_at = ?, updated_at = ? WHERE id = ?',
      [parent.id, '2020-01-01', '2020-01-02', product.id]
    );
    const before = rows('product_catalog');
    db.execute('INSERT INTO product_definitions (ean, name) VALUES (?, ?)', [
      '5901111111111',
      'Łosoś',
    ]);
    const definitionsBefore = rows('product_definitions');
    setupDatabase();
    sqlite.reopen();
    setupDatabase();

    expect(
      rows('product_catalog').filter(
        (row) => row.product_ean !== '5901111111111'
      )
    ).toEqual(before);
    expect(rows('product_definitions')).toEqual(definitionsBefore);
    expect(
      await products.findCatalogProductByEan('5901111111111')
    ).toMatchObject({normalizedName: 'łosoś'});
  });

  it('rolls back the entire backfill if a later catalog insert fails', () => {
    db.execute('INSERT INTO product_definitions (ean, name) VALUES (?, ?)', [
      '5901234123457',
      'Śliwki',
    ]);
    db.execute('INSERT INTO product_definitions (ean, name) VALUES (?, ?)', [
      '5901111111111',
      'Łosoś',
    ]);
    const definitionsBefore = rows('product_definitions');
    db.execute(`CREATE TRIGGER fail_second_backfill BEFORE INSERT ON product_catalog
      WHEN (SELECT COUNT(*) FROM product_catalog) >= 1
      BEGIN SELECT RAISE(ABORT, 'backfill insert failed'); END`);
    expect(setupDatabase).toThrow('backfill insert failed');
    sqlite.reopen();
    expect(rows('product_catalog')).toEqual([]);
    expect(rows('product_definitions')).toEqual(definitionsBefore);
    db.execute('DROP TRIGGER fail_second_backfill');
    setupDatabase();
    expect(rows('product_catalog')).toHaveLength(2);
  });

  it.each([
    ['Śliwki', 'planned'],
    ['Śliwki', 'stored'],
    ['Śliwki', 'purchased'],
    ['ŁOSOŚ', 'planned'],
    ['ŁOSOŚ', 'stored'],
    ['ŁOSOŚ', 'purchased'],
  ] as const)(
    'merges a %s suggestion into an existing %s text item without duplicating it',
    async (name, status) => {
      const manual = await shopping.createList('Zakupy', 'manual');
      const existing = await shopping.addItem(manual.id, {
        label: name,
        quantity: 1,
        status,
      });
      const auto = await shopping.createList('Minimum', 'auto');
      await shopping.addItem(auto.id, {
        label: ` ${name.toUpperCase()} `,
        quantity: 3,
      });
      const suggestions = await lists.generateReplenishmentSuggestions();
      expect(suggestions).toHaveLength(1);
      expect(
        await shopping.addAllSuggestionsToManualList(manual.id, suggestions)
      ).toEqual({
        added: 0,
        reactivated: status === 'stored' ? 1 : 0,
        skipped: status === 'stored' ? 0 : 1,
      });
      sqlite.reopen();
      setupDatabase();

      expect(await shopping.getItems(manual.id)).toMatchObject([
        {
          id: existing.id,
          label: name,
          quantity: status === 'purchased' ? 1 : 3,
          status: status === 'purchased' ? 'purchased' : 'planned',
        },
      ]);
      expect(await shopping.getItems(manual.id)).toHaveLength(1);
      expect(
        (await shopping.addAllSuggestionsToManualList(manual.id, suggestions))
          .added
      ).toBe(0);
      expect(await shopping.getItems(manual.id)).toHaveLength(1);
    }
  );

  it('keeps accented and unaccented names distinct when merging suggestions', async () => {
    const manual = await shopping.createList('Zakupy', 'manual');
    await shopping.addItem(manual.id, {label: 'Sliwki', quantity: 1});
    const auto = await shopping.createList('Minimum', 'auto');
    await shopping.addItem(auto.id, {label: 'Śliwki', quantity: 3});
    const suggestions = await lists.generateReplenishmentSuggestions();
    expect(
      (await shopping.addAllSuggestionsToManualList(manual.id, suggestions))
        .added
    ).toBe(1);
    expect(
      (await shopping.getItems(manual.id)).map((item) => item.label)
    ).toEqual(['Sliwki', 'Śliwki']);
  });

  it('uses the first matching text item in list order', async () => {
    const manual = await shopping.createList('Zakupy', 'manual');
    const first = await shopping.addItem(manual.id, {
      label: 'ŚLIWKI',
      quantity: 1,
    });
    const second = await shopping.addItem(manual.id, {
      label: 'śliwki',
      quantity: 2,
    });
    const auto = await shopping.createList('Minimum', 'auto');
    await shopping.addItem(auto.id, {label: 'Śliwki', quantity: 3});
    await shopping.addAllSuggestionsToManualList(
      manual.id,
      await lists.generateReplenishmentSuggestions()
    );
    sqlite.reopen();
    setupDatabase();
    expect(await shopping.getItems(manual.id)).toMatchObject([
      {id: first.id, quantity: 3},
      {id: second.id, quantity: 2},
    ]);
    expect(await shopping.getItems(manual.id)).toHaveLength(2);
  });

  it.each(names)(
    'counts fresh generic and unlinked %s copies using %s while excluding EAN and expired copies',
    async (name, normalized) => {
      await products.addToInventory(
        'unlinked',
        null,
        ` \t${name.toUpperCase()}\u00a0 `,
        null
      );
      await products.addToInventory('expired', null, name, '2000-01-01');
      await products.addToInventory('unnamed', null, null, null);
      const generic = await products.saveGenericCatalogProduct({name});
      await products.addToInventory(
        'linked',
        null,
        'Stara nazwa',
        '2999-01-01',
        generic.id
      );
      await products.saveDefinition({ean: '5901234123457', name});
      await products.addToInventory('specific', '5901234123457', null, null);
      sqlite.reopen();
      setupDatabase();

      expect(
        await products.countFreshInventoryByCustomName(normalized, '2026-11-15')
      ).toBe(2);
      expect(
        await products.countFreshInventoryByCustomName(' ', '2026-11-15')
      ).toBe(0);
      await products.updateCatalogProduct(generic.id, {
        name: 'Inny produkt',
        brand: null,
        category: null,
      });
      sqlite.reopen();
      setupDatabase();
      expect(
        await products.countFreshInventoryByCustomName(normalized, '2026-11-15')
      ).toBe(1);
      expect(
        await products.countFreshInventoryByCustomName(
          'INNY PRODUKT',
          '2026-11-15'
        )
      ).toBe(1);
    }
  );
});
