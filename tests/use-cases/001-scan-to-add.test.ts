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
      findDefinitionByEan: jest.fn().mockResolvedValueOnce(null).mockResolvedValue({
        ean: '5901234567890', name: 'Jogurt naturalny', category: 'Nabiał',
      }),
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

  it('returns the persisted local definition when it differs from the OFF result', async () => {
    const local = {ean: '5901234123457', name: 'Lokalna nazwa', brand: 'Lokalna marka'};
    const remote = {...local, name: 'Remote name'};
    const databaseService = {
      findDefinitionByEan: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(local),
      saveDefinition: jest.fn().mockResolvedValue(undefined),
    };
    const scanner = new ScanToAdd(databaseService, {fetchProductByEAN: jest.fn().mockResolvedValue(remote)});

    expect(await scanner.execute({ean: local.ean})).toEqual(local);
    expect(databaseService.saveDefinition).toHaveBeenCalledWith(remote);
  });

  it('reports a missing persisted definition instead of showing unsaved OFF data', async () => {
    const remote = {ean: '5901234123457', name: 'Remote name'};
    const databaseService = {
      findDefinitionByEan: jest.fn().mockResolvedValue(null),
      saveDefinition: jest.fn().mockResolvedValue(undefined),
    };
    const scanner = new ScanToAdd(databaseService, {fetchProductByEAN: jest.fn().mockResolvedValue(remote)});

    await expect(scanner.execute({ean: remote.ean})).rejects.toThrow('Product definition not found after save');
  });
});
