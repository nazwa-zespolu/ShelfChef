import {sqlite} from '../helpers/sqlite';

jest.mock('react-native-quick-sqlite', () => ({
  open: () => sqlite,
}), {virtual: true});

import { setupDatabase, db } from '../../src/infrastructure/db/init';
import { ProductRepository } from '../../src/infrastructure/ProductRepository';
import { ShoppingListRepository } from '../../src/infrastructure/ShoppingListRepository';
import { ShoppingList } from '../../src/app/ShoppingList';
import { InventoryItem, ProductDefinition } from '../../src/domain/types';

describe('ProductRepository + database integration', () => {
  let repository: ProductRepository;
  let shoppingListRepository: ShoppingListRepository;

  beforeEach(() => {
    sqlite.reset();
    setupDatabase();
    repository = new ProductRepository();
    shoppingListRepository = new ShoppingListRepository();
  });

  afterAll(() => sqlite.close());

  it('tworzy od razu kompletny schemat bez danych demonstracyjnych', async () => {
    const columns = (table: string) => {
      const rows = db.execute(`PRAGMA table_info(${table})`).rows!;
      return Array.from({length: rows.length}, (_, index) => rows.item(index).name);
    };
    expect(columns('product_definitions')).toEqual(expect.arrayContaining([
      'normalized_name', 'is_vegetarian', 'is_vegan', 'is_gluten_free', 'is_lactose_free',
    ]));
    expect(columns('inventory')).toEqual(expect.arrayContaining([
      'created_at', 'opened_at', 'is_vegetarian', 'is_vegan', 'is_gluten_free', 'is_lactose_free',
    ]));
    expect(columns('product_catalog')).toContain('image_url');
    for (const table of ['inventory', 'product_definitions', 'product_catalog', 'app_settings', 'shopping_lists']) {
      expect(db.execute(`SELECT COUNT(*) AS count FROM ${table}`).rows!.item(0).count).toBe(0);
    }
    expect(await repository.getRecipeModelConsentState()).toBe('unknown');
  });

  it('zachowuje dane i ustawienia po ponownym otwarciu bazy, bez przywracania usuniętych produktów', async () => {
    await repository.addToInventory('keep', null, 'Jabłko', '2030-01-01');
    await repository.addToInventory('remove', null, 'Gruszka', null);
    await repository.markAsOpened('keep', '2026-09-08T10:00:00.000Z');
    await repository.setRecipeModelConsent(true);
    await repository.removeFromInventory('remove');
    const before = await repository.getFullInventory();

    sqlite.reopen();
    setupDatabase();
    setupDatabase();

    expect(await repository.getFullInventory()).toEqual(before);
    expect(before).toHaveLength(1);
    expect(await repository.getRecipeModelConsentState()).toBe('accepted');
  });

  it('wycofuje nieudaną inicjalizację i pozwala przygotować bazę ponownie', async () => {
    sqlite.reset();
    const execute = sqlite.execute.bind(sqlite);
    const failure = jest.spyOn(sqlite, 'execute').mockImplementation((sql, params) => {
      if (sql.includes('CREATE TABLE IF NOT EXISTS inventory')) {
        throw new Error('test initialization failure');
      }
      return execute(sql, params);
    });
    try {
      expect(setupDatabase).toThrow('test initialization failure');
    } finally {
      failure.mockRestore();
    }
    expect(db.execute("SELECT name FROM sqlite_master WHERE type = 'table'").rows!.length).toBe(0);

    setupDatabase();
    expect(await repository.getFullInventory()).toEqual([]);
  });

  it('zapisuje i odczytuje definicje produktu po EAN', async () => {
    const definition: ProductDefinition = {
      ean: '5901234123457',
      name: 'Mleko 2%',
      brand: 'Lacpol',
      imageUrl: 'https://img/mleko.jpg',
      category: 'Nabial',
    };

    await repository.saveDefinition(definition);

    const found = await repository.findDefinitionByEan('5901234123457');

    expect(found).toEqual(definition);
  });

  it('synchronizuje zapisaną definicję produktu z katalogiem specific', async () => {
    await repository.saveDefinition({
      ean: '5901234123457',
      name: 'Mleko 2%',
      brand: 'Lacpol',
      imageUrl: 'https://img/mleko.jpg',
      category: 'Nabial',
    });

    const catalog = db.execute('SELECT * FROM product_catalog WHERE product_ean = ?', [
      '5901234123457',
    ]).rows!;

    expect(catalog.length).toBe(1);
    expect(catalog.item(0)).toMatchObject({
      id: 'catalog-specific-5901234123457',
      name: 'Mleko 2%',
      normalized_name: 'mleko 2%',
      kind: 'specific',
      product_ean: '5901234123457',
      image_url: 'https://img/mleko.jpg',
      parent_catalog_product_id: null,
    });
    await expect(repository.findCatalogProductByEan('5901234123457')).resolves.toMatchObject({
      imageUrl: 'https://img/mleko.jpg',
    });
  });

  it('zapisuje ręczny produkt bez EAN ze zdjęciem w katalogu generic', async () => {
    await repository.saveGenericCatalogProduct('Domowy sos', 'file:///photos/domowy-sos.jpg');
    await repository.addToInventory('inv-sauce', null, 'Domowy sos', null);

    const inventoryItems = await repository.getFullInventory();
    const catalogItems = await shoppingListRepository.searchCatalogProducts('sos');

    expect(inventoryItems).toHaveLength(1);
    expect(inventoryItems[0]).toMatchObject({
      id: 'inv-sauce',
      name: 'Domowy sos',
      imageUrl: 'file:///photos/domowy-sos.jpg',
      expiryDate: null,
    });
    expect(catalogItems).toHaveLength(1);
    expect(catalogItems[0]).toMatchObject({
      name: 'Domowy sos',
      kind: 'generic',
      productEan: null,
      imageUrl: 'file:///photos/domowy-sos.jpg',
    });
  });

  it('zapisuje ręczny produkt z EAN ze zdjęciem w definicji i katalogu specific', async () => {
    await repository.saveDefinition({
      ean: '5901234123457',
      name: 'Mleko 2%',
      brand: 'Lacpol',
      imageUrl: 'file:///photos/mleko.jpg',
      category: 'Nabial',
    });

    const definition = await repository.findDefinitionByEan('5901234123457');
    const catalog = await repository.findCatalogProductByEan('5901234123457');

    expect(definition?.imageUrl).toBe('file:///photos/mleko.jpg');
    expect(catalog).toMatchObject({
      id: 'catalog-specific-5901234123457',
      kind: 'specific',
      productEan: '5901234123457',
      imageUrl: 'file:///photos/mleko.jpg',
    });
  });

  it('nie nadpisuje flag dietetycznych przy zwyklym update definicji', async () => {
    await repository.saveDefinition({
      ean: '5901234123457',
      name: 'Mleko',
      brand: 'Lacpol',
      imageUrl: 'https://img/mleko.jpg',
      category: 'Nabial',
      dietary: {
        isVegetarian: true,
        isVegan: false,
        isGlutenFree: true,
        isLactoseFree: false,
      },
    });

    await repository.saveDefinition({
      ean: '5901234123457',
      name: 'Mleko 2%',
      brand: 'Lacpol',
      imageUrl: 'https://img/mleko2.jpg',
      category: 'Nabial',
    });

    const found = await repository.findDefinitionByEan('5901234123457');

    expect(found?.dietary).toEqual({
      isVegetarian: true,
      isVegan: false,
      isGlutenFree: true,
      isLactoseFree: false,
    });
  });

  it('filtruje skladniki po diecie wegetarianskiej', async () => {
    await repository.saveDefinition({
      ean: '111',
      name: 'Jajka',
      dietary: {
        isVegetarian: true,
        isVegan: false,
        isGlutenFree: true,
        isLactoseFree: true,
      },
    });
    await repository.saveDefinition({
      ean: '222',
      name: 'Kurczak',
      dietary: {
        isVegetarian: false,
        isVegan: false,
        isGlutenFree: true,
        isLactoseFree: true,
      },
    });

    await repository.addToInventory('inv-1', '111', null, '2026-01-01');
    await repository.addToInventory('inv-2', '222', null, '2026-01-02');

    const names = await repository.getRecipeIngredientNames('vegetarian');

    expect(names).toEqual(['Jajka']);
  });

  it('zwraca null, gdy brak definicji dla EAN', async () => {
    const found = await repository.findDefinitionByEan('9999999999999');
    expect(found).toBeNull();
  });

  it('zwraca inventory posortowane po dacie i z fallbackiem custom_name', async () => {
    const yogurtDefinition: ProductDefinition = {
      ean: '111',
      name: 'Jogurt',
      brand: 'Mlekovita',
      imageUrl: undefined,
      category: 'Nabial',
    };

    await repository.saveDefinition(yogurtDefinition);

    await repository.addToInventory('inv-late', '111', null, '2026-12-31');
    await repository.addToInventory('inv-early', null, 'Domowy sos', '2026-05-10');

    const items: InventoryItem[] = await repository.getFullInventory();

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: 'inv-early',
      ean: '',
      name: 'Domowy sos',
      isOpened: false,
    });
    expect(items[1]).toMatchObject({
      id: 'inv-late',
      ean: '111',
      name: 'Jogurt',
      brand: 'Mlekovita',
      category: 'Nabial',
      isOpened: false,
    });
  });

  it('oznacza produkt jako otwarty i zapisuje openedAt', async () => {
    await repository.addToInventory('inv-open', null, 'Pesto', '2026-08-01');
    await repository.markAsOpened('inv-open', '2026-04-16T08:30:00.000Z');

    const items: InventoryItem[] = await repository.getFullInventory();

    expect(items[0]).toMatchObject({
      id: 'inv-open',
      isOpened: true,
      openedAt: '2026-04-16T08:30:00.000Z',
    });
  });

  it('cofa otwarcie produktu i usuwa openedAt', async () => {
    await repository.addToInventory('inv-close', null, 'Sos sojowy', '2026-08-01');
    await repository.markAsOpened('inv-close', '2026-04-16T08:30:00.000Z');
    await repository.markAsClosed('inv-close');

    const items: InventoryItem[] = await repository.getFullInventory();

    expect(items[0]).toMatchObject({
      id: 'inv-close',
      isOpened: false,
      openedAt: null,
    });
  });

  it('usuwa element z inventory', async () => {
    await repository.addToInventory('inv-remove', null, 'Keczup', '2026-09-01');
    await repository.removeFromInventory('inv-remove');

    const items: InventoryItem[] = await repository.getFullInventory();
    expect(items).toHaveLength(0);
  });

  it('zapisuje null jako brak daty ważności', async () => {
    await repository.addToInventory('inv-no-expiry', null, 'Sól', null);

    const items: InventoryItem[] = await repository.getFullInventory();

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'inv-no-expiry',
      name: 'Sól',
      expiryDate: null,
    });
  });

  it('inicjalizuje schemat list zakupów bez wymuszania domyślnej listy', () => {
    const lists = db.execute('SELECT * FROM shopping_lists').rows!;

    expect(lists.length).toBe(0);
  });

  it('backfilluje katalog produktów z istniejących definicji bez parenta', () => {
    db.execute('DELETE FROM inventory');
    db.execute('DELETE FROM product_definitions');
    db.execute('DELETE FROM product_catalog');
    db.execute('DELETE FROM shopping_lists');
    db.execute('DELETE FROM shopping_list_item_catalog_products');
    db.execute(
      'INSERT OR REPLACE INTO product_definitions (ean, name, brand, image_url, category) VALUES (?, ?, ?, ?, ?)',
      ['5901234123457', 'Mleko 2%', 'Lacpol', null, 'Nabial'],
    );

    setupDatabase();

    const catalog = db.execute('SELECT * FROM product_catalog').rows!;

    expect(catalog.length).toBe(1);
    expect(catalog.item(0)).toMatchObject({
      id: 'catalog-specific-5901234123457',
      name: 'Mleko 2%',
      normalized_name: 'mleko 2%',
      kind: 'specific',
      product_ean: '5901234123457',
      parent_catalog_product_id: null,
    });
  });

  it('tworzy listy zakupów z ikoną i kolorem oraz dodaje tekstową pozycję do listy manual', async () => {
    const list = await shoppingListRepository.createList('Cotygodniowe', 'manual', 'cart', 'blue');
    const item = await shoppingListRepository.addItem(list.id, {
      label: 'Mleko',
      quantity: 2,
    });
    const bread = await shoppingListRepository.addItem(list.id, {
      label: 'Chleb',
      quantity: 1,
    });
    await shoppingListRepository.updateItemOrder(list.id, [bread.id, item.id]);

    const lists = await shoppingListRepository.getLists();
    const items = await shoppingListRepository.getItems(list.id);

    expect(lists.map(l => l.name)).toContain('Cotygodniowe');
    expect(lists.find(l => l.id === list.id)?.iconKey).toBe('cart');
    expect(lists.find(l => l.id === list.id)?.iconColorKey).toBe('blue');
    expect(item).toMatchObject({
      listId: list.id,
      catalogProductId: null,
      label: 'Mleko',
      quantity: 2,
      status: 'planned',
      source: 'manual',
    });
    expect(items.map(i => i.label)).toEqual(['Chleb', 'Mleko']);
  });

  it('edytuje nazwę, ikonę i kolor listy bez zmiany typu', async () => {
    const list = await shoppingListRepository.createList('Cotygodniowe', 'manual', 'cart', 'blue');

    const updated = await shoppingListRepository.updateList(list.id, {
      name: 'Zakupy weekendowe',
      iconKey: 'basket',
      iconColorKey: 'amber',
    });
    const stored = await shoppingListRepository.getListById(list.id);

    expect(updated).toMatchObject({
      id: list.id,
      name: 'Zakupy weekendowe',
      type: 'manual',
      iconKey: 'basket',
      iconColorKey: 'amber',
    });
    expect(stored).toMatchObject(updated);
  });

  it('edytuje tekstową pozycję bez zmiany jej ilości, statusu i powiązań', async () => {
    await repository.saveDefinition({
      ean: '5901234123457',
      name: 'Mleko 2%',
      brand: 'Lacpol',
      imageUrl: undefined,
      category: 'Nabial',
    });
    const catalog = db.execute('SELECT * FROM product_catalog WHERE product_ean = ?', [
      '5901234123457',
    ]).rows!.item(0);
    const list = await shoppingListRepository.createList('Cotygodniowe', 'manual');
    const item = await shoppingListRepository.addItem(list.id, {
      label: 'Mleko',
      iconKey: 'box',
      iconColorKey: 'green',
      quantity: 2,
      status: 'purchased',
    });
    await shoppingListRepository.linkCatalogProductToItem(item.id, catalog.id as string);

    await shoppingListRepository.updateTextItem(item.id, {
      label: '  Mleko do kawy  ',
      iconKey: 'bottle',
      iconColorKey: 'blue',
    });

    const updated = (await shoppingListRepository.getItems(list.id))[0];
    expect(updated).toMatchObject({
      id: item.id,
      listId: list.id,
      catalogProductId: null,
      label: 'Mleko do kawy',
      iconKey: 'bottle',
      iconColorKey: 'blue',
      quantity: 2,
      status: 'purchased',
      source: 'manual',
      sortOrder: item.sortOrder,
    });
    expect(updated.linkedCatalogProducts.map(product => product.id)).toEqual([catalog.id]);
  });

  it('nie pozwala edytować pustej ani katalogowej pozycji jako tekstowej', async () => {
    await repository.saveDefinition({
      ean: '5901234123457',
      name: 'Mleko 2%',
      brand: 'Lacpol',
      imageUrl: undefined,
      category: 'Nabial',
    });
    const catalog = db.execute('SELECT * FROM product_catalog WHERE product_ean = ?', [
      '5901234123457',
    ]).rows!.item(0);
    const list = await shoppingListRepository.createList('Cotygodniowe', 'manual');
    const textItem = await shoppingListRepository.addItem(list.id, {label: 'Mleko'});
    const catalogItem = await shoppingListRepository.addItem(list.id, {
      catalogProductId: catalog.id as string,
      label: 'Mleko 2%',
    });

    await expect(
      shoppingListRepository.updateTextItem(textItem.id, {
        label: ' ',
        iconKey: 'box',
        iconColorKey: 'green',
      }),
    ).rejects.toThrow('Shopping list item label cannot be empty');
    await expect(
      shoppingListRepository.updateTextItem(catalogItem.id, {
        label: 'Inna nazwa',
        iconKey: 'box',
        iconColorKey: 'green',
      }),
    ).rejects.toThrow('Only text shopping items can be edited');
  });

  it('zapisuje powiązania pozycji listy z produktami katalogowymi', async () => {
    await repository.saveDefinition({
      ean: '5901234123457',
      name: 'Mleko 2%',
      brand: 'Lacpol',
      imageUrl: 'https://img/mleko.jpg',
      category: 'Nabial',
    });
    const catalog = db.execute('SELECT * FROM product_catalog WHERE product_ean = ?', [
      '5901234123457',
    ]).rows!.item(0);
    const list = await shoppingListRepository.createList('Minimum', 'auto');
    const item = await shoppingListRepository.addItem(list.id, {
      label: 'Mleko',
      quantity: 1,
    });

    await shoppingListRepository.linkCatalogProductToItem(item.id, catalog.id as string);
    const linkedItems = await shoppingListRepository.getItems(list.id);

    expect(linkedItems[0].linkedCatalogProducts).toHaveLength(1);
    expect(linkedItems[0].linkedCatalogProducts[0]).toMatchObject({
      id: 'catalog-specific-5901234123457',
      name: 'Mleko 2%',
      kind: 'specific',
      imageUrl: 'https://img/mleko.jpg',
    });
    expect(linkedItems[0].linkedCatalogProducts[0].imageUrl).toBe('https://img/mleko.jpg');

    await shoppingListRepository.unlinkCatalogProductFromItem(item.id, catalog.id as string);
    const unlinkedItems = await shoppingListRepository.getItems(list.id);

    expect(unlinkedItems[0].linkedCatalogProducts).toHaveLength(0);
  });

  it('nie pozwala podpinać katalogu do pozycji, która już jest katalogowa', async () => {
    await repository.saveDefinition({
      ean: '5901234123457',
      name: 'Mleko 2%',
      brand: 'Lacpol',
      imageUrl: undefined,
      category: 'Nabial',
    });
    const catalog = db.execute('SELECT * FROM product_catalog WHERE product_ean = ?', [
      '5901234123457',
    ]).rows!.item(0);
    const list = await shoppingListRepository.createList('Minimum', 'auto');
    const item = await shoppingListRepository.addItem(list.id, {
      catalogProductId: catalog.id as string,
      label: 'Mleko 2%',
      quantity: 1,
    });

    await expect(
      shoppingListRepository.linkCatalogProductToItem(item.id, catalog.id as string),
    ).rejects.toThrow('Catalog links can only be added to text shopping items');
  });

  it('zapisuje kolejność list i usuwa listę razem z jej pozycjami', async () => {
    const first = await shoppingListRepository.createList('Pierwsza', 'manual');
    const second = await shoppingListRepository.createList('Druga', 'manual');
    const third = await shoppingListRepository.createList('Trzecia', 'auto');
    await shoppingListRepository.addItem(second.id, {
      label: 'Mleko',
      quantity: 1,
    });

    await shoppingListRepository.updateListOrder([second.id, first.id, third.id]);
    let lists = await shoppingListRepository.getLists();
    expect(lists.map(list => list.id).slice(0, 2)).toEqual([second.id, first.id]);

    await shoppingListRepository.deleteList(second.id);
    lists = await shoppingListRepository.getLists();

    expect(lists.map(list => list.id)).not.toContain(second.id);
    expect(await shoppingListRepository.getItems(second.id)).toHaveLength(0);
  });

  it('pozwala dodać tekstową pozycję do listy auto jako ręczny item', async () => {
    const list = await shoppingListRepository.createList('Moje minimum 2', 'auto');

    const item = await shoppingListRepository.addItem(list.id, {
      label: 'Coś na deser',
    });

    expect(item).toMatchObject({
      listId: list.id,
      catalogProductId: null,
      label: 'Coś na deser',
      status: 'planned',
      source: 'manual',
    });
  });

  it('generuje sugestie z listy auto i merguje je z listą manual', async () => {
    const definitions = [
      {ean: '111', name: 'Mleko'},
      {ean: '222', name: 'Chleb'},
      {ean: '333', name: 'Ser'},
      {ean: '444', name: 'Masło'},
      {ean: '555', name: 'Jogurt'},
    ];
    for (const definition of definitions) {
      await repository.saveDefinition({
        ...definition,
        brand: undefined,
        imageUrl: undefined,
        category: undefined,
      });
    }

    const catalogByEan = (ean: string) =>
      db.execute('SELECT * FROM product_catalog WHERE product_ean = ?', [ean]).rows!.item(0);

    const milk = catalogByEan('111');
    const bread = catalogByEan('222');
    const cheese = catalogByEan('333');
    const butter = catalogByEan('444');
    const yogurt = catalogByEan('555');
    const auto = await shoppingListRepository.createList('Moje minimum', 'auto');
    const manual = await shoppingListRepository.createList('Cotygodniowe', 'manual');

    await shoppingListRepository.addItem(auto.id, {
      catalogProductId: milk.id as string,
      label: 'Mleko',
      quantity: 3,
    });
    await shoppingListRepository.addItem(auto.id, {
      catalogProductId: bread.id as string,
      label: 'Chleb',
      quantity: 2,
    });
    await shoppingListRepository.addItem(auto.id, {
      catalogProductId: cheese.id as string,
      label: 'Ser',
      quantity: 2,
    });
    await shoppingListRepository.addItem(auto.id, {
      catalogProductId: butter.id as string,
      label: 'Masło',
      quantity: 2,
    });
    await shoppingListRepository.addItem(auto.id, {
      catalogProductId: yogurt.id as string,
      label: 'Jogurt',
      quantity: 4,
    });

    await shoppingListRepository.addItem(manual.id, {
      catalogProductId: milk.id as string,
      label: 'Mleko',
      quantity: 1,
      status: 'planned',
    });
    await shoppingListRepository.addItem(manual.id, {
      catalogProductId: bread.id as string,
      label: 'Chleb',
      quantity: 1,
      status: 'stored',
    });
    await shoppingListRepository.addItem(manual.id, {
      catalogProductId: cheese.id as string,
      label: 'Ser',
      quantity: 1,
      status: 'stored',
    });
    await shoppingListRepository.addItem(manual.id, {
      catalogProductId: butter.id as string,
      label: 'Masło',
      quantity: 1,
      status: 'purchased',
    });
    await repository.addToInventory('inv-milk-1', '111', null, '2999-01-01');

    const shoppingList = new ShoppingList(shoppingListRepository, repository);
    const suggestions = await shoppingList.generateReplenishmentSuggestions();
    const result = await shoppingList.addAllSuggestionsToList(manual.id);
    const suggestionsByName = new Map(suggestions.map(suggestion => [suggestion.name, suggestion]));

    const itemsByLabel = new Map(
      (await shoppingListRepository.getItems(manual.id)).map(item => [item.label, item]),
    );

    expect(suggestions).toHaveLength(5);
    expect(suggestionsByName.get('Mleko')).toMatchObject({
      catalogProductId: milk.id,
      currentQuantity: 1,
      missingQuantity: 2,
      targetQuantity: 3,
      reason: 'Masz 1 z 3',
      sourceAutoListIds: [auto.id],
    });
    expect(suggestionsByName.get('Jogurt')).toMatchObject({
      catalogProductId: yogurt.id,
      currentQuantity: 0,
      missingQuantity: 4,
      targetQuantity: 4,
    });
    expect(result).toEqual({added: 1, reactivated: 2, skipped: 2});
    expect(itemsByLabel.get('Mleko')).toMatchObject({quantity: 2, status: 'planned'});
    expect(itemsByLabel.get('Chleb')).toMatchObject({
      quantity: 2,
      status: 'planned',
      source: 'reactivated',
      storedAt: null,
    });
    expect(itemsByLabel.get('Ser')).toMatchObject({
      quantity: 2,
      status: 'planned',
      source: 'reactivated',
    });
    expect(itemsByLabel.get('Masło')).toMatchObject({quantity: 1, status: 'purchased'});
    expect(itemsByLabel.get('Jogurt')).toMatchObject({
      catalogProductId: yogurt.id,
      quantity: 4,
      status: 'planned',
      source: 'suggestion',
    });
  });

  it('odrzuca merge sugestii do listy auto', async () => {
    const auto = await shoppingListRepository.createList('Moje minimum 2', 'auto');

    await expect(
      shoppingListRepository.addAllSuggestionsToManualList(auto.id, []),
    ).rejects.toThrow('Suggestions can only be added to manual lists');
  });

  it('finalizuje kupione pozycje i dodaje wiele sztuk jako osobne rekordy inventory', async () => {
    const manual = await shoppingListRepository.createList('Cotygodniowe', 'manual');
    const item = await shoppingListRepository.addItem(manual.id, {
      label: 'Mleko',
      quantity: 2,
      status: 'purchased',
    });

    const result = await shoppingListRepository.completePurchase(manual.id, {
      [item.id]: null,
    });
    const items = await shoppingListRepository.getItems(manual.id);
    const inventoryItems = await repository.getFullInventory();

    expect(result.inventoryIds).toHaveLength(2);
    expect(new Set(result.inventoryIds).size).toBe(2);
    expect(result.storedItemIds).toEqual([item.id]);
    expect(items[0]).toMatchObject({status: 'planned', storedAt: null});
    expect(inventoryItems).toHaveLength(2);
    expect(inventoryItems[0].name).toBe('Mleko');
    expect(inventoryItems[1].name).toBe('Mleko');
    for (const inventoryItem of inventoryItems) {
      expect(Number.isNaN(Date.parse(inventoryItem.createdAt))).toBe(false);
    }
    expect(await shoppingListRepository.completePurchase(manual.id)).toEqual({
      inventoryIds: [], storedItemIds: [],
    });
    sqlite.reopen();
    setupDatabase();
    expect(await repository.getFullInventory()).toEqual(inventoryItems);
  });

  it('finalizuje tekstową pozycję z jednoznacznym powiązaniem katalogowym jako produkt po EAN', async () => {
    await repository.saveDefinition({
      ean: '5901234123457',
      name: 'Mleko 2%',
      brand: 'Lacpol',
      imageUrl: 'https://img/mleko.jpg',
      category: 'Nabial',
    });
    const catalog = db.execute('SELECT * FROM product_catalog WHERE product_ean = ?', [
      '5901234123457',
    ]).rows!.item(0);
    const manual = await shoppingListRepository.createList('Cotygodniowe', 'manual');
    const item = await shoppingListRepository.addItem(manual.id, {
      label: 'Mleko do kawy',
      quantity: 1,
      status: 'purchased',
    });

    await shoppingListRepository.linkCatalogProductToItem(item.id, catalog.id as string);
    await shoppingListRepository.completePurchase(manual.id, {[item.id]: null});

    const inventoryItems = await repository.getFullInventory();

    expect(inventoryItems).toHaveLength(1);
    expect(inventoryItems[0]).toMatchObject({
      ean: '5901234123457',
      name: 'Mleko 2%',
      imageUrl: 'https://img/mleko.jpg',
    });
  });

  it('po finalizacji produktów z sugestii przestaje pokazywać je w Do uzupełnienia', async () => {
    const auto = await shoppingListRepository.createList('Minimum', 'auto');
    const manual = await shoppingListRepository.createList('Zakupy', 'manual');
    const genericMilk = await shoppingListRepository.createGenericCatalogProduct('Mleko');
    const shoppingList = new ShoppingList(shoppingListRepository, repository);

    await shoppingListRepository.addItem(auto.id, {
      catalogProductId: genericMilk.id,
      label: genericMilk.name,
      quantity: 2,
    });

    expect(await shoppingList.generateReplenishmentSuggestions()).toMatchObject([
      {
        catalogProductId: genericMilk.id,
        missingQuantity: 2,
        currentQuantity: 0,
      },
    ]);

    await shoppingList.addAllSuggestionsToList(manual.id);
    const [suggestedItem] = await shoppingListRepository.getItems(manual.id);
    await shoppingList.updateItemStatus(suggestedItem.id, 'purchased');
    await shoppingList.completePurchase(manual.id, {[suggestedItem.id]: null});

    expect(await repository.getFullInventory()).toHaveLength(2);
    expect(await shoppingList.generateReplenishmentSuggestions()).toEqual([]);
  });
  it('wycofuje wszystkie sztuki i status zakupu, gdy zapis drugiej sztuki zawiedzie', async () => {
    const list = await shoppingListRepository.createList('Zakupy', 'manual');
    const item = await shoppingListRepository.addItem(list.id, {
      label: 'Jabłko', quantity: 2, status: 'purchased',
    });
    db.execute(`CREATE TRIGGER fail_second_inventory_insert
      BEFORE INSERT ON inventory
      WHEN (SELECT COUNT(*) FROM inventory) >= 1
      BEGIN SELECT RAISE(ABORT, 'test write failure'); END`);

    await expect(shoppingListRepository.completePurchase(list.id)).rejects.toThrow('test write failure');
    expect(await repository.getFullInventory()).toEqual([]);
    expect(await shoppingListRepository.getItems(list.id)).toMatchObject([{status: 'purchased'}]);

    db.execute('DROP TRIGGER fail_second_inventory_insert');
    const result = await shoppingListRepository.completePurchase(list.id);
    expect(result.inventoryIds).toHaveLength(2);
    expect(await repository.getFullInventory()).toHaveLength(2);
    expect(item.quantity).toBe(2);
  });

  it('finalizuje listę automatyczną z datą i nie dodaje zakupionych sztuk ponownie', async () => {
    const list = await shoppingListRepository.createList('Minimum', 'auto');
    const item = await shoppingListRepository.addItem(list.id, {
      label: 'Jabłko', quantity: 2, status: 'purchased',
    });
    await shoppingListRepository.completePurchase(list.id, {[item.id]: '2030-01-01'});
    expect(await shoppingListRepository.getItems(list.id)).toMatchObject([{status: 'stored'}]);
    expect(await repository.getFullInventory()).toMatchObject([
      {expiryDate: '2030-01-01'}, {expiryDate: '2030-01-01'},
    ]);
    expect((await shoppingListRepository.completePurchase(list.id)).inventoryIds).toEqual([]);
  });

});
