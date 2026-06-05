import { ShoppingList } from "../../src/app/ShoppingList";

describe("UC-06: ShoppingList - completePurchase", () => {
  it("returns separate inventory records for multiple purchased units", async () => {
    const result = {
      inventoryIds: ["inv-1", "inv-2"],
      storedItemIds: ["item-milk"],
    };
    const shoppingRepository = {
      completePurchase: jest.fn(async () => result),
    };
    const shoppingList = new ShoppingList(shoppingRepository as any);

    const returned = await shoppingList.completePurchase("list-1", {
      "item-milk": "2026-06-01",
    });

    expect(shoppingRepository.completePurchase).toHaveBeenCalledWith("list-1", {
      "item-milk": "2026-06-01",
    });
    expect(returned.inventoryIds).toEqual(["inv-1", "inv-2"]);
    expect(returned.inventoryIds).toHaveLength(2);
    expect(returned.storedItemIds).toEqual(["item-milk"]);
  });

  it("updates item status through the shopping list repository", async () => {
    const shoppingRepository = {
      updateItemStatus: jest.fn(async () => undefined),
    };
    const shoppingList = new ShoppingList(shoppingRepository as any);

    await shoppingList.updateItemStatus("item-1", "purchased");

    expect(shoppingRepository.updateItemStatus).toHaveBeenCalledWith("item-1", "purchased");
  });

  it("updates a text item through the shopping list repository", async () => {
    const shoppingRepository = {
      updateTextItem: jest.fn(async () => undefined),
    };
    const shoppingList = new ShoppingList(shoppingRepository as any);
    const input = {
      label: "Mleko do kawy",
      iconKey: "bottle",
      iconColorKey: "blue",
    };

    await shoppingList.updateTextItem("item-1", input);

    expect(shoppingRepository.updateTextItem).toHaveBeenCalledWith("item-1", input);
  });
});
