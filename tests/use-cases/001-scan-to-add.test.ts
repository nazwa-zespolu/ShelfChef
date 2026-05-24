import { ScanToAdd } from "../../src/app/ScanToAdd";

describe("UC-01: ScanToAdd", () => {
  it("returns existing product from local DB without calling OFF", async () => {
    const databaseService = {
      findDefinitionByEan: jest.fn().mockResolvedValue({
        ean: "5901234567890",
        name: "Jogurt naturalny",
      }),
      saveDefinition: jest.fn(),
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
    }) as any;

    expect(databaseService.findDefinitionByEan).toHaveBeenCalledWith("5901234567890");
    expect(openFoodFactsService.fetchProductByEAN).not.toHaveBeenCalled();
    expect(databaseService.saveDefinition).not.toHaveBeenCalled();
    expect(result.name).toBe("Jogurt naturalny");
  });

  it("queries OFF and saves definition when not found locally", async () => {
    const databaseService = {
      findDefinitionByEan: jest.fn().mockResolvedValue(null),
      saveDefinition: jest.fn().mockResolvedValue(undefined),
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
    });

    expect(databaseService.findDefinitionByEan).toHaveBeenCalledWith("5901234567890");
    expect(openFoodFactsService.fetchProductByEAN).toHaveBeenCalledWith("5901234567890");
    expect(databaseService.saveDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        ean: "5901234567890",
        name: "Jogurt naturalny",
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        ean: "5901234567890",
        name: "Jogurt naturalny",
      }),
    );
  });

  it("falls back to manual add when OFF is unavailable", async () => {
    const databaseService = {
      findDefinitionByEan: jest.fn().mockResolvedValue(null),
      saveDefinition: jest.fn(),
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
    });

    expect(databaseService.findDefinitionByEan).toHaveBeenCalledWith("5901234567890");
    expect(openFoodFactsService.fetchProductByEAN).toHaveBeenCalledWith("5901234567890");
    expect(databaseService.saveDefinition).not.toHaveBeenCalled();
    expect(result).toEqual({ fallback: "manual", ean: "5901234567890" });
  });
});
