import { ScanToAdd } from "../../src/app/ScanToAdd";

describe("UC-01: ScanToAdd", () => {
  it("returns existing product from local DB without calling OFF", async () => {
    const databaseService = {
      queryProductByEan: jest.fn().mockResolvedValue({
        id: "existing-uuid",
        ean: "5901234567890",
        name: "Jogurt naturalny",
      }),
      insertProduct: jest.fn(),
    };

    const openFoodFactsService = {
      fetchProductByEAN: jest.fn(),
    };

    const scanToAdd = new ScanToAdd(
      databaseService as any,
      openFoodFactsService as any
    );

    const result = await scanToAdd.execute({
      ean: "5901234567890",
      expirationDate: new Date("2026-05-01"),
      count: 1,
    });

    expect(databaseService.queryProductByEan).toHaveBeenCalledWith("5901234567890");
    expect(openFoodFactsService.fetchProductByEAN).not.toHaveBeenCalled();
    expect(databaseService.insertProduct).not.toHaveBeenCalled();
    expect(result.name).toBe("Jogurt naturalny");
  });

  it("queries OFF, saves template and product when not found locally", async () => {
    const databaseService = {
      queryProductByEan: jest.fn().mockResolvedValue(null),
      insertTemplate: jest.fn().mockResolvedValue("template-1"),
      insertProduct: jest.fn().mockResolvedValue("uuid-123"),
    };

    const openFoodFactsService = {
      fetchProductByEAN: jest.fn().mockResolvedValue({
        ean: "5901234567890",
        name: "Jogurt naturalny",
        category: "Nabiał",
      }),
    };

    const scanToAdd = new ScanToAdd(
      databaseService as any,
      openFoodFactsService as any
    );

    const result = await scanToAdd.execute({
      ean: "5901234567890",
      expirationDate: new Date("2026-05-01"),
      count: 1,
    });

    expect(databaseService.queryProductByEan).toHaveBeenCalledWith("5901234567890");
    expect(openFoodFactsService.fetchProductByEAN).toHaveBeenCalledWith("5901234567890");
    expect(databaseService.insertTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        ean: "5901234567890",
        name: "Jogurt naturalny",
      })
    );
    expect(databaseService.insertProduct).toHaveBeenCalledTimes(1);
    expect(result).toEqual(["uuid-123"]);
  });

  it("creates multiple records when count is greater than 1", async () => {
    const databaseService = {
      queryProductByEan: jest.fn().mockResolvedValue(null),
      insertTemplate: jest.fn().mockResolvedValue("template-1"),
      insertProduct: jest.fn()
        .mockResolvedValueOnce("uuid-a")
        .mockResolvedValueOnce("uuid-b")
        .mockResolvedValueOnce("uuid-c"),
    };

    const openFoodFactsService = {
      fetchProductByEAN: jest.fn().mockResolvedValue({
        ean: "5901234567890",
        name: "Mleko",
      }),
    };

    const scanToAdd = new ScanToAdd(
      databaseService as any,
      openFoodFactsService as any
    );

    const result = await scanToAdd.execute({
      ean: "5901234567890",
      expirationDate: new Date("2026-05-01"),
      count: 3,
    });

    expect(databaseService.queryProductByEan).toHaveBeenCalledWith("5901234567890");
    expect(openFoodFactsService.fetchProductByEAN).toHaveBeenCalledTimes(1);
    expect(databaseService.insertTemplate).toHaveBeenCalledTimes(1);
    expect(databaseService.insertProduct).toHaveBeenCalledTimes(3);
    expect(result).toEqual(["uuid-a", "uuid-b", "uuid-c"]);
  });

  it("falls back to manual add when OFF is unavailable", async () => {
    const databaseService = {
      queryProductByEan: jest.fn().mockResolvedValue(null),
      insertProduct: jest.fn(),
    };

    const openFoodFactsService = {
      fetchProductByEAN: jest.fn().mockRejectedValue(new Error("API unavailable")),
    };

    const scanToAdd = new ScanToAdd(
      databaseService as any,
      openFoodFactsService as any
    );

    const result = await scanToAdd.execute({
      ean: "5901234567890",
      expirationDate: new Date("2026-05-01"),
      count: 1,
    });

    expect(databaseService.queryProductByEan).toHaveBeenCalledWith("5901234567890");
    expect(openFoodFactsService.fetchProductByEAN).toHaveBeenCalledWith("5901234567890");
    expect(databaseService.insertProduct).not.toHaveBeenCalled();
    expect(result).toEqual({ fallback: "manual", ean: "5901234567890" });
  });
});
