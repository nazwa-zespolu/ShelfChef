import { ShoppingList } from "../../src/app/ShoppingList";

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
  parentCatalogProductId: null,
  createdAt: "2026-05-27T00:00:00.000Z",
  updatedAt: "2026-05-27T00:00:00.000Z",
};

const milkItem = {
  id: "item-milk",
  listId: "auto-1",
  catalogProductId: "catalog-specific-111",
  label: "Mleko",
  quantity: 3,
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
    getCatalogProducts: jest.fn(async () => [milk]),
    setListLocked: jest.fn(async () => undefined),
    updateItemStatusSnapshot: jest.fn(async () => undefined),
  };

  const productRepository = {
    getFullInventory: jest.fn(async () => [
      {
        id: "inv-1",
        ean: "111",
        name: "Mleko",
        expiryDate: "2999-01-01",
        isOpened: false,
      },
    ]),
  };

  return {shoppingRepository, productRepository};
}

describe("UC-06: ShoppingList - domain rules", () => {
  it("recalculates effective statuses for unlocked auto lists", async () => {
    const {shoppingRepository, productRepository} = createRepositories();
    const shoppingList = new ShoppingList(shoppingRepository as any, productRepository as any);

    const result = await shoppingList.getListWithEffectiveStatuses("auto-1");

    expect(result.items[0]).toMatchObject({
      id: "item-milk",
      effectiveStatus: "planned",
      currentQuantity: 1,
      missingQuantity: 2,
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
