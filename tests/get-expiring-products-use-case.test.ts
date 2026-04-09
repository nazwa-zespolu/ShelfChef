import { GetExpiringProductsUseCase } from "../src/application/use-cases/GetExpiringProductsUseCase";

describe("GetExpiringProductsUseCase", () => {
  it("returns only products marked as expiring soon by policy", async () => {
    const productRepository = {
      getAll: jest.fn().mockResolvedValue([
        { id: "p1", name: "Milk", expirationDate: new Date("2026-04-09T10:00:00.000Z") },
        { id: "p2", name: "Rice", expirationDate: new Date("2026-05-10T10:00:00.000Z") },
      ]),
    };

    const expiryPolicy = {
      isExpiringSoon: jest
        .fn()
        .mockImplementation((date: Date) => date <= new Date("2026-04-11T10:00:00.000Z")),
    };

    const useCase = new GetExpiringProductsUseCase(productRepository as any, expiryPolicy as any);
    const result = await useCase.execute(new Date("2026-04-08T10:00:00.000Z"));

    expect(productRepository.getAll).toHaveBeenCalledTimes(1);
    expect(expiryPolicy.isExpiringSoon).toHaveBeenCalledTimes(2);
    expect(result).toEqual([
      { id: "p1", name: "Milk", expirationDate: new Date("2026-04-09T10:00:00.000Z") },
    ]);
  });
});
