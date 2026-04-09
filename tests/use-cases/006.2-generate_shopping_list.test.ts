import { ShoppingList } from "../../src/app/ShoppingList";

describe("UC-06: ShoppingList - generateSuggestions & createList", () => {
  it("suggests products with expired dates", async () => {
    const databaseService = {
      queryAllProducts: jest.fn().mockResolvedValue([
        { id: "1", name: "Jogurt", expirationDate: new Date("2026-03-01") },
        { id: "2", name: "Ser", expirationDate: new Date("2026-03-15") },
        { id: "3", name: "Maslo", expirationDate: new Date("2026-06-01") },
      ]),
    };

    const shoppingList = new ShoppingList(databaseService as any);

    const now = new Date("2026-04-09");
    const result = await shoppingList.generateSuggestions(now);

    expect(databaseService.queryAllProducts).toHaveBeenCalledTimes(1);
    expect(result.suggestions).toHaveLength(2);
    expect(result.suggestions.map((s: any) => s.name)).toContain("Jogurt");
    expect(result.suggestions.map((s: any) => s.name)).toContain("Ser");
    expect(result.suggestions.map((s: any) => s.name)).not.toContain("Maslo");
  });

  it("returns empty suggestions when all products are fresh", async () => {
    const databaseService = {
      queryAllProducts: jest.fn().mockResolvedValue([
        { id: "p1", name: "Ryz", expirationDate: new Date("2026-06-01") },
        { id: "p2", name: "Makaron", expirationDate: new Date("2026-07-01") },
      ]),
    };

    const shoppingList = new ShoppingList(databaseService as any);

    const result = await shoppingList.generateSuggestions();

    expect(databaseService.queryAllProducts).toHaveBeenCalledTimes(1);
    expect(result.suggestions).toHaveLength(0);
  });

  it("creates shopping list from confirmed suggestions and custom items", async () => {
    const databaseService = {
      queryAllProducts: jest.fn().mockResolvedValue([
        { id: "1", name: "Mleko", expirationDate: new Date("2026-03-10") },
        { id: "2", name: "Chleb", expirationDate: new Date("2026-03-12") },
      ]),
    };

    const shoppingList = new ShoppingList(databaseService as any);

    const result = await shoppingList.createList({
      confirmedSuggestionIds: ["1", "2"],
      customItems: [{ name: "Pomidory" }],
    });

    expect(result.items).toHaveLength(3);
    const allNames = result.items.map((i: any) => i.name);
    expect(allNames).toContain("Mleko");
    expect(allNames).toContain("Chleb");
    expect(allNames).toContain("Pomidory");
  });

  it("rejects unconfirmed suggestions", async () => {
    const databaseService = {
      queryAllProducts: jest.fn().mockResolvedValue([
        { id: "1", name: "Mleko", expirationDate: new Date("2026-03-10") },
        { id: "2", name: "Chleb", expirationDate: new Date("2026-03-12") },
        { id: "3", name: "Jajka", expirationDate: new Date("2026-03-14") },
      ]),
    };

    const shoppingList = new ShoppingList(databaseService as any);

    const result = await shoppingList.createList({
      confirmedSuggestionIds: ["1"],
      customItems: [],
    });

    const allNames = result.items.map((i: any) => i.name);
    expect(allNames).toContain("Mleko");
    expect(allNames).not.toContain("Chleb");
    expect(allNames).not.toContain("Jajka");
    expect(result.items).toHaveLength(1);
  });

  it("returns empty suggestions when database has no products", async () => {
    const databaseService = {
      queryAllProducts: jest.fn().mockResolvedValue([]),
    };

    const shoppingList = new ShoppingList(databaseService as any);

    const result = await shoppingList.generateSuggestions();

    expect(databaseService.queryAllProducts).toHaveBeenCalledTimes(1);
    expect(result.suggestions).toHaveLength(0);
  });
});
