import { GenerateShoppingListUseCase } from "../../src/app/use-cases/GenerateShoppingListUseCase";

describe("GenerateShoppingListUseCase", () => {
  it("generuje sugestie brakujacych produktow na podstawie niskich zapasow", async () => {
    const productRepository = {
      getAll: jest.fn().mockResolvedValue([
        { id: "p1", name: "Mleko", quantity: 0, expirationDate: new Date("2026-04-15") },
        { id: "p2", name: "Jajka", quantity: 0, expirationDate: new Date("2026-04-20") },
        { id: "p3", name: "Maslo", quantity: 5, expirationDate: new Date("2026-05-01") },
      ]),
    };

    const shoppingListRepository = {
      insert: jest.fn(),
    };

    const useCase = new GenerateShoppingListUseCase(
      productRepository as any,
      shoppingListRepository as any
    );

    const result = await useCase.execute({});

    expect(productRepository.getAll).toHaveBeenCalledTimes(1);
    expect(result.suggestions).toHaveLength(2);
    expect(result.suggestions.map((s: any) => s.name)).toContain("Mleko");
    expect(result.suggestions.map((s: any) => s.name)).toContain("Jajka");
    expect(result.suggestions.map((s: any) => s.name)).not.toContain("Maslo");
  });

  it("nie sugeruje produktow z wystarczajaca iloscia", async () => {
    const productRepository = {
      getAll: jest.fn().mockResolvedValue([
        { id: "p1", name: "Ryz", quantity: 3, expirationDate: new Date("2026-06-01") },
        { id: "p2", name: "Makaron", quantity: 5, expirationDate: new Date("2026-07-01") },
        { id: "p3", name: "Cukier", quantity: 2, expirationDate: new Date("2026-08-01") },
      ]),
    };

    const shoppingListRepository = {
      insert: jest.fn(),
    };

    const useCase = new GenerateShoppingListUseCase(
      productRepository as any,
      shoppingListRepository as any
    );

    const result = await useCase.execute({});

    expect(productRepository.getAll).toHaveBeenCalledTimes(1);
    expect(result.suggestions).toHaveLength(0);
  });

  it("tworzy liste zakupow z zatwierdzonych sugestii i wlasnych pozycji", async () => {
    const productRepository = {
      getAll: jest.fn().mockResolvedValue([
        { id: "p1", name: "Mleko", quantity: 0, expirationDate: new Date("2026-04-15") },
        { id: "p2", name: "Chleb", quantity: 0, expirationDate: new Date("2026-04-10") },
      ]),
    };

    const shoppingListRepository = {
      insert: jest.fn().mockResolvedValue("list-001"),
    };

    const useCase = new GenerateShoppingListUseCase(
      productRepository as any,
      shoppingListRepository as any
    );

    const result = await useCase.execute({
      confirmedSuggestionIds: ["p1", "p2"],
      customItems: [{ name: "Pomidory", quantity: 4 }],
    });

    expect(shoppingListRepository.insert).toHaveBeenCalledTimes(1);

    const insertedList = shoppingListRepository.insert.mock.calls[0][0];
    const allNames = insertedList.items.map((i: any) => i.name);
    expect(allNames).toContain("Mleko");
    expect(allNames).toContain("Chleb");
    expect(allNames).toContain("Pomidory");
    expect(insertedList.items).toHaveLength(3);
    expect(result.listId).toBe("list-001");
  });

  it("odrzuca niezatwierdzone sugestie", async () => {
    const productRepository = {
      getAll: jest.fn().mockResolvedValue([
        { id: "p1", name: "Mleko", quantity: 0, expirationDate: new Date("2026-04-15") },
        { id: "p2", name: "Chleb", quantity: 0, expirationDate: new Date("2026-04-10") },
        { id: "p3", name: "Jajka", quantity: 0, expirationDate: new Date("2026-04-12") },
      ]),
    };

    const shoppingListRepository = {
      insert: jest.fn().mockResolvedValue("list-002"),
    };

    const useCase = new GenerateShoppingListUseCase(
      productRepository as any,
      shoppingListRepository as any
    );

    const result = await useCase.execute({
      confirmedSuggestionIds: ["p1"],
      customItems: [],
    });

    const insertedList = shoppingListRepository.insert.mock.calls[0][0];
    const allNames = insertedList.items.map((i: any) => i.name);
    expect(allNames).toContain("Mleko");
    expect(allNames).not.toContain("Chleb");
    expect(allNames).not.toContain("Jajka");
    expect(insertedList.items).toHaveLength(1);
  });

  it("zwraca pusta liste sugestii gdy brak produktow w bazie", async () => {
    const productRepository = {
      getAll: jest.fn().mockResolvedValue([]),
    };

    const shoppingListRepository = {
      insert: jest.fn(),
    };

    const useCase = new GenerateShoppingListUseCase(
      productRepository as any,
      shoppingListRepository as any
    );

    const result = await useCase.execute({});

    expect(productRepository.getAll).toHaveBeenCalledTimes(1);
    expect(result.suggestions).toHaveLength(0);
  });

  it("zwraca sugestie dla produktow z przekroczona data waznosci", async () => {
    const productRepository = {
      getAll: jest.fn().mockResolvedValue([
        { id: "p1", name: "Jogurt", quantity: 2, expirationDate: new Date("2026-03-01") },
        { id: "p2", name: "Ser", quantity: 1, expirationDate: new Date("2026-03-15") },
        { id: "p3", name: "Maslo", quantity: 3, expirationDate: new Date("2026-06-01") },
      ]),
    };

    const shoppingListRepository = {
      insert: jest.fn(),
    };

    const useCase = new GenerateShoppingListUseCase(
      productRepository as any,
      shoppingListRepository as any
    );

    const now = new Date("2026-04-09");
    const result = await useCase.execute({}, now);

    expect(result.suggestions).toHaveLength(2);
    expect(result.suggestions.map((s: any) => s.name)).toContain("Jogurt");
    expect(result.suggestions.map((s: any) => s.name)).toContain("Ser");
    expect(result.suggestions.map((s: any) => s.name)).not.toContain("Maslo");
  });
});
