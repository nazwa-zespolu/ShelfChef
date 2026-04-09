import { ShoppingList } from "../../src/app/ShoppingList";

describe("UC-06: ShoppingList - completePurchase", () => {
  it("adds purchased products to inventory as separate records", async () => {
    const databaseService = {
      insertProduct: jest.fn()
        .mockResolvedValueOnce("uuid-1")
        .mockResolvedValueOnce("uuid-2"),
    };

    const shoppingList = new ShoppingList(databaseService as any);

    await shoppingList.completePurchase([
      { name: "Mleko", expirationDate: new Date("2026-05-01") },
      { name: "Chleb", expirationDate: new Date("2026-04-20") },
    ]);

    expect(databaseService.insertProduct).toHaveBeenCalledTimes(2);
    expect(databaseService.insertProduct).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Mleko" })
    );
    expect(databaseService.insertProduct).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Chleb" })
    );
  });

  it("removes purchased items from shopping list", async () => {
    const databaseService = {
      insertProduct: jest.fn().mockResolvedValue("uuid-new"),
      deleteProduct: jest.fn().mockResolvedValue(undefined),
    };

    const shoppingList = new ShoppingList(databaseService as any);

    await shoppingList.completePurchase([
      { name: "Maslo", expirationDate: new Date("2026-05-01") },
      { name: "Jajka", expirationDate: new Date("2026-04-20") },
    ]);

    expect(databaseService.insertProduct).toHaveBeenCalledTimes(2);
  });

  it("does not add not purchased products to inventory", async () => {
    const databaseService = {
      insertProduct: jest.fn().mockResolvedValue("uuid-new"),
    };

    const shoppingList = new ShoppingList(databaseService as any);

    await shoppingList.completePurchase([
      { name: "Ryz", expirationDate: new Date("2026-06-01") },
      { name: "Makaron", expirationDate: new Date("2026-07-01") },
    ]);

    expect(databaseService.insertProduct).toHaveBeenCalledTimes(2);
    expect(databaseService.insertProduct).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: "Cukier" })
    );
  });

  it("returns UUIDs of added products", async () => {
    const databaseService = {
      insertProduct: jest.fn()
        .mockResolvedValueOnce("uuid-aaa")
        .mockResolvedValueOnce("uuid-bbb"),
    };

    const shoppingList = new ShoppingList(databaseService as any);

    const result = await shoppingList.completePurchase([
      { name: "Ser", expirationDate: new Date("2026-05-10") },
      { name: "Szynka", expirationDate: new Date("2026-05-15") },
    ]);

    expect(result).toEqual(["uuid-aaa", "uuid-bbb"]);
  });
});
