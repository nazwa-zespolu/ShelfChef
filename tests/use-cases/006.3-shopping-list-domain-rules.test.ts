import { ShoppingList } from "../../src/app/ShoppingList";
import { ShoppingListItem } from "../../src/domain/types";

const autoList = {
  id: "auto-1",
  name: "Moje minimum",
  type: "auto" as const,
  isLocked: false,
  isArchived: false,
  sortOrder: 0,
  lockedAt: null,
  createdAt: "2026-05-27T00:00:00.000Z",
  updatedAt: "2026-05-27T00:00:00.000Z",
};

const lockedAutoList = {
  ...autoList,
  id: "auto-locked",
  name: "Zablokowana",
  isLocked: true,
};

const milk = {
  id: "catalog-specific-111",
  name: "Mleko",
  normalizedName: "mleko",
  kind: "specific" as const,
  productEan: "111",
  imageUrl: null,
  parentCatalogProductId: null,
  createdAt: "2026-05-27T00:00:00.000Z",
  updatedAt: "2026-05-27T00:00:00.000Z",
};

const genericMilk = {
  id: "catalog-generic-milk",
  name: "Mleko",
  normalizedName: "mleko",
  kind: "generic" as const,
  productEan: null,
  imageUrl: null,
  parentCatalogProductId: null,
  createdAt: "2026-05-27T00:00:00.000Z",
  updatedAt: "2026-05-27T00:00:00.000Z",
};

const lactoseFreeMilk = {
  id: "catalog-specific-222",
  name: "Mleko bez laktozy",
  normalizedName: "mleko bez laktozy",
  kind: "specific" as const,
  productEan: "222",
  imageUrl: null,
  parentCatalogProductId: null,
  createdAt: "2026-05-27T00:00:00.000Z",
  updatedAt: "2026-05-27T00:00:00.000Z",
};

const milkItem: ShoppingListItem = {
  id: "item-milk",
  listId: "auto-1",
  catalogProductId: "catalog-specific-111",
  linkedCatalogProducts: [],
  label: "Mleko",
  iconKey: "box",
  iconColorKey: "green",
  imageUrl: null,
  quantity: 3,
  sortOrder: 0,
  status: "planned" as const,
  source: "manual" as const,
  storedAt: null,
  createdAt: "2026-05-27T00:00:00.000Z",
  updatedAt: "2026-05-27T00:00:00.000Z",
};

function createRepositories(items = [milkItem]) {
  const shoppingRepository = {
    getListById: jest.fn(async (id: string) =>
      id === lockedAutoList.id ? lockedAutoList : autoList,
    ),
    getLists: jest.fn(async () => [autoList, lockedAutoList]),
    getItems: jest.fn(async (listId: string) =>
      listId === lockedAutoList.id
        ? [{...milkItem, id: "locked-item", listId, quantity: 10}]
        : items,
    ),
    getCatalogProducts: jest.fn(async () => [milk, genericMilk, lactoseFreeMilk]),
    setListLocked: jest.fn(async () => undefined),
    updateItemStatusSnapshot: jest.fn(async () => undefined),
  };

  const productRepository = {
    getFullInventory: jest.fn(async () => [
      {
        id: "inv-1",
        ean: "111",
        name: "Mleko",
        expiryDate: "2999-01-01" as string | null,
        isOpened: false,
      },
    ]),
  };

  return {shoppingRepository, productRepository};
}

describe("UC-06: ShoppingList - domain rules", () => {
  it("recalculates effective statuses for unlocked auto lists", async () => {
    const {shoppingRepository, productRepository} = createRepositories([
      {...milkItem, id: "item-milk-1", quantity: 1},
      {...milkItem, id: "item-milk-2", quantity: 1},
      {
        ...milkItem,
        id: "item-text-milk",
        catalogProductId: null,
        label: "Mleko",
        quantity: 1,
      },
      {
        ...milkItem,
        id: "item-generic-milk",
        catalogProductId: "catalog-generic-milk",
        label: "Mleko",
        quantity: 1,
      },
      {
        ...milkItem,
        id: "item-purchased-milk",
        status: "purchased",
        quantity: 1,
      },
    ]);
    const shoppingList = new ShoppingList(shoppingRepository as any, productRepository as any);

    const result = await shoppingList.getListWithEffectiveStatuses("auto-1");

    expect(result.items[0]).toMatchObject({
      id: "item-milk-1",
      effectiveStatus: "stored",
      currentQuantity: 1,
      missingQuantity: 0,
    });
    expect(result.items[1]).toMatchObject({
      id: "item-milk-2",
      effectiveStatus: "planned",
      currentQuantity: 1,
      missingQuantity: 1,
    });
    expect(result.items[2]).toMatchObject({
      id: "item-text-milk",
      effectiveStatus: "planned",
      currentQuantity: 1,
      missingQuantity: 1,
    });
    expect(result.items[3]).toMatchObject({
      id: "item-generic-milk",
      effectiveStatus: "planned",
      currentQuantity: 1,
      missingQuantity: 1,
    });
    expect(result.items[4]).toMatchObject({
      id: "item-purchased-milk",
      effectiveStatus: "purchased",
      currentQuantity: 1,
      missingQuantity: 0,
    });
  });

  it("generates replenishment suggestions only from unlocked auto lists", async () => {
    const {shoppingRepository, productRepository} = createRepositories();
    shoppingRepository.getLists.mockResolvedValueOnce([
      autoList,
      {...autoList, id: "auto-2", name: "Rosol"},
      lockedAutoList,
    ]);
    shoppingRepository.getItems.mockImplementation(async (listId: string) =>
      listId === lockedAutoList.id
        ? [{...milkItem, id: "locked-item", listId, quantity: 10}]
        : [{...milkItem, id: `item-${listId}`, listId, quantity: listId === "auto-2" ? 5 : 3}],
    );
    const shoppingList = new ShoppingList(shoppingRepository as any, productRepository as any);

    const suggestions = await shoppingList.generateReplenishmentSuggestions();

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      catalogProductId: "catalog-specific-111",
      missingQuantity: 4,
      currentQuantity: 1,
      targetQuantity: 5,
      reason: "Masz 1 z 5",
      sourceAutoListIds: ["auto-1", "auto-2"],
    });
  });

  it("keeps replenishment shortage consistent with displayed inventory count", async () => {
    const {shoppingRepository, productRepository} = createRepositories();
    shoppingRepository.getLists.mockResolvedValueOnce([
      autoList,
      {...autoList, id: "auto-2", name: "Minimum 2"},
    ]);
    shoppingRepository.getItems.mockImplementation(async (listId: string) =>
      listId === autoList.id
        ? [
            {
              ...milkItem,
              id: "text-milk",
              catalogProductId: null,
              label: "Mleko",
              quantity: 7,
            },
          ]
        : [{...milkItem, id: "specific-milk", listId, quantity: 13}],
    );
    productRepository.getFullInventory.mockResolvedValueOnce([
      ...Array.from({length: 7}, (_, index) => ({
        id: `inv-no-expiry-${index}`,
        ean: "111",
        name: "Mleko",
        expiryDate: null,
        isOpened: false,
      })),
      {
        id: "inv-with-expiry",
        ean: "111",
        name: "Mleko",
        expiryDate: "2999-01-01",
        isOpened: false,
      },
    ]);
    const shoppingList = new ShoppingList(shoppingRepository as any, productRepository as any);

    const suggestions = await shoppingList.generateReplenishmentSuggestions();

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      catalogProductId: "catalog-specific-111",
      currentQuantity: 8,
      missingQuantity: 5,
      targetQuantity: 13,
      reason: "Masz 8 z 13",
    });
  });

  it("includes text auto list items in replenishment suggestions", async () => {
    const {shoppingRepository, productRepository} = createRepositories([
      {
        ...milkItem,
        id: "item-text-uhh",
        catalogProductId: null,
        label: "Uhh",
        quantity: 1,
      },
      {
        ...milkItem,
        id: "item-specific-milk",
        quantity: 4,
      },
    ]);
    const shoppingList = new ShoppingList(shoppingRepository as any, productRepository as any);

    const suggestions = await shoppingList.generateReplenishmentSuggestions();

    expect(suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          catalogProductId: null,
          name: "Uhh",
          normalizedName: "uhh",
          missingQuantity: 1,
          currentQuantity: 0,
          targetQuantity: 1,
          reason: "Masz 0 z 1",
        }),
      ]),
    );
  });

  it("counts linked catalog products for text auto items", async () => {
    const {shoppingRepository, productRepository} = createRepositories([
      {
        ...milkItem,
        id: "item-text-milk",
        catalogProductId: null,
        linkedCatalogProducts: [lactoseFreeMilk],
        label: "Mleko",
        quantity: 1,
      },
    ]);
    productRepository.getFullInventory.mockResolvedValueOnce([
      {
        id: "inv-lactose-free",
        ean: "222",
        name: "Mleko bez laktozy",
        expiryDate: "2999-01-01",
        isOpened: false,
      },
    ]);
    const shoppingList = new ShoppingList(shoppingRepository as any, productRepository as any);

    const result = await shoppingList.getListWithEffectiveStatuses("auto-1");

    expect(result.items[0]).toMatchObject({
      id: "item-text-milk",
      effectiveStatus: "stored",
      currentQuantity: 1,
      missingQuantity: 0,
    });
  });

  it("stores effective planned/stored statuses when locking an auto list", async () => {
    const item = {...milkItem, quantity: 1};
    const {shoppingRepository, productRepository} = createRepositories([item]);
    const shoppingList = new ShoppingList(shoppingRepository as any, productRepository as any);

    await shoppingList.setListLocked("auto-1", true);

    expect(shoppingRepository.updateItemStatusSnapshot).toHaveBeenCalledWith(
      "item-milk",
      "stored",
    );
    expect(shoppingRepository.setListLocked).toHaveBeenCalledWith("auto-1", true);
  });
});
