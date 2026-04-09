import { AddProductByScanUseCase } from "../src/app/use-cases/AddProductByScanUseCase";

describe("AddProductByScanUseCase", () => {
  it("saves product when Open Food Facts returns product details", async () => {
    const productRepository = {
      findByEan: jest.fn().mockResolvedValue(null),
      insert: jest.fn().mockResolvedValue("p-123"),
    };

    const openFoodFactsClient = {
      fetchProductByEAN: jest.fn().mockResolvedValue({
        ean: "5901234567890",
        name: "Natural Yogurt",
      }),
    };

    const manualAddFallback = { execute: jest.fn() };

    const useCase = new AddProductByScanUseCase(
      productRepository as any,
      openFoodFactsClient as any,
      manualAddFallback as any
    );

    const result = await useCase.execute("5901234567890");

    expect(productRepository.findByEan).toHaveBeenCalledWith("5901234567890");
    expect(openFoodFactsClient.fetchProductByEAN).toHaveBeenCalledWith("5901234567890");
    expect(productRepository.insert).toHaveBeenCalledTimes(1);
    expect(manualAddFallback.execute).not.toHaveBeenCalled();
    expect(result).toBe("p-123");
  });

  it("uses manual fallback when Open Food Facts request fails", async () => {
    const productRepository = {
      findByEan: jest.fn().mockResolvedValue(null),
      insert: jest.fn(),
    };

    const openFoodFactsClient = {
      fetchProductByEAN: jest.fn().mockRejectedValue(new Error("OFF unavailable")),
    };

    const manualAddFallback = {
      execute: jest.fn().mockResolvedValue("manual-flow-started"),
    };

    const useCase = new AddProductByScanUseCase(
      productRepository as any,
      openFoodFactsClient as any,
      manualAddFallback as any
    );

    const result = await useCase.execute("5900000000000");

    expect(productRepository.insert).not.toHaveBeenCalled();
    expect(manualAddFallback.execute).toHaveBeenCalledWith({ ean: "5900000000000" });
    expect(result).toBe("manual-flow-started");
  });
});
