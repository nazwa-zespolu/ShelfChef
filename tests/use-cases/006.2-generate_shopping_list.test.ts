import { ShoppingList } from "../../src/app/ShoppingList";

const manualList = {
  id: "manual-1",
  name: "Cotygodniowe",
  type: "manual" as const,
  isLocked: false,
  isArchived: false,
  sortOrder: 0,
  lockedAt: null,
  createdAt: "2026-05-27T00:00:00.000Z",
  updatedAt: "2026-05-27T00:00:00.000Z",
};

describe("UC-06: ShoppingList - create and merge lists", () => {
  it("creates a shopping list through the repository", async () => {
    const shoppingRepository = {
      createList: jest.fn(async () => manualList),
    };
    const shoppingList = new ShoppingList(shoppingRepository as any);

    const result = await shoppingList.createList("Cotygodniowe", "manual");

    expect(shoppingRepository.createList).toHaveBeenCalledWith("Cotygodniowe", "manual");
    expect(result).toEqual(manualList);
  });

  it("adds generated replenishment suggestions to a manual list", async () => {
    const suggestion = {
      catalogProductId: "catalog-specific-111",
      name: "Mleko",
      normalizedName: "mleko",
      missingQuantity: 1,
      currentQuantity: 1,
      targetQuantity: 2,
      reason: "Masz 1 z 2",
      priority: "low" as const,
      sourceAutoListIds: ["auto-1"],
      sourceAutoListNames: ["Moje minimum"],
    };
    const summary = {added: 1, reactivated: 0, skipped: 0};
    const shoppingRepository = {
      getLists: jest.fn(async () => []),
      addAllSuggestionsToManualList: jest.fn(async () => summary),
    };
    const shoppingList = new ShoppingList(shoppingRepository as any);
    jest.spyOn(shoppingList, "generateReplenishmentSuggestions").mockResolvedValueOnce([
      suggestion,
    ]);

    const result = await shoppingList.addAllSuggestionsToList("manual-1");

    expect(shoppingRepository.addAllSuggestionsToManualList).toHaveBeenCalledWith(
      "manual-1",
      [suggestion],
    );
    expect(result).toEqual(summary);
  });
});
