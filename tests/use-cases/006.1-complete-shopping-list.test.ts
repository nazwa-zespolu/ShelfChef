import { CompleteShoppingUseCase } from "../../src/app/use-cases/CompleteShoppingUseCase";

describe("CompleteShoppingUseCase", () => {
  it("dodaje kupione produkty do zapasow", async () => {
    const productRepository = {
      insert: jest.fn()
        .mockResolvedValueOnce("uuid-1")
        .mockResolvedValueOnce("uuid-2"),
    };

    const shoppingListRepository = {
      getItemsByIds: jest.fn().mockResolvedValue([
        { id: "item-1", name: "Mleko", quantity: 2 },
        { id: "item-2", name: "Chleb", quantity: 1 },
      ]),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    const useCase = new CompleteShoppingUseCase(
      productRepository as any,
      shoppingListRepository as any
    );

    await useCase.execute(["item-1", "item-2"]);

    expect(productRepository.insert).toHaveBeenCalledTimes(2);
    expect(productRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Mleko", quantity: 2 })
    );
    expect(productRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Chleb", quantity: 1 })
    );
  });

  it("usuwa zrealizowane pozycje z listy zakupow", async () => {
    const productRepository = {
      insert: jest.fn().mockResolvedValue("uuid-new"),
    };

    const shoppingListRepository = {
      getItemsByIds: jest.fn().mockResolvedValue([
        { id: "item-1", name: "Maslo", quantity: 1 },
        { id: "item-2", name: "Jajka", quantity: 10 },
      ]),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    const useCase = new CompleteShoppingUseCase(
      productRepository as any,
      shoppingListRepository as any
    );

    await useCase.execute(["item-1", "item-2"]);

    expect(shoppingListRepository.delete).toHaveBeenCalledTimes(2);
    expect(shoppingListRepository.delete).toHaveBeenCalledWith("item-1");
    expect(shoppingListRepository.delete).toHaveBeenCalledWith("item-2");
  });

  it("nie dodaje do zapasow produktow nieoznaczonych jako kupione", async () => {
    const productRepository = {
      insert: jest.fn().mockResolvedValue("uuid-new"),
    };

    const shoppingListRepository = {
      getItemsByIds: jest.fn().mockResolvedValue([
        { id: "item-2", name: "Ryz", quantity: 1 },
        { id: "item-3", name: "Makaron", quantity: 2 },
      ]),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    const useCase = new CompleteShoppingUseCase(
      productRepository as any,
      shoppingListRepository as any
    );

    await useCase.execute(["item-2", "item-3"]);

    expect(shoppingListRepository.getItemsByIds).toHaveBeenCalledWith(["item-2", "item-3"]);
    expect(productRepository.insert).toHaveBeenCalledTimes(2);
    expect(productRepository.insert).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: "Cukier" })
    );
  });

  it("zwraca UUID dodanych produktow", async () => {
    const productRepository = {
      insert: jest.fn()
        .mockResolvedValueOnce("uuid-aaa")
        .mockResolvedValueOnce("uuid-bbb"),
    };

    const shoppingListRepository = {
      getItemsByIds: jest.fn().mockResolvedValue([
        { id: "item-1", name: "Ser", quantity: 1 },
        { id: "item-2", name: "Szynka", quantity: 1 },
      ]),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    const useCase = new CompleteShoppingUseCase(
      productRepository as any,
      shoppingListRepository as any
    );

    const result = await useCase.execute(["item-1", "item-2"]);

    expect(result).toEqual(["uuid-aaa", "uuid-bbb"]);
  });
});
