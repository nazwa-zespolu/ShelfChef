import { DeleteProduct } from "../../src/app/DeleteProduct";

describe("UC-03: DeleteProduct", () => {
  it("deletes product from database by id", async () => {
    const databaseService = {
      deleteProduct: jest.fn().mockResolvedValue(undefined),
    };

    const deleteProduct = new DeleteProduct(databaseService as any);

    await deleteProduct.execute({ id: "uuid-123", action: "delete" });

    expect(databaseService.deleteProduct).toHaveBeenCalledWith("uuid-123");
  });

  it("decreases product quantity instead of deleting", async () => {
    const databaseService = {
      updateProduct: jest.fn().mockResolvedValue(undefined),
    };

    const deleteProduct = new DeleteProduct(databaseService as any);

    await deleteProduct.execute({
      id: "uuid-456",
      action: "decrease",
      decreaseBy: 2,
    });

    expect(databaseService.updateProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "uuid-456",
        decreaseBy: 2,
      })
    );
  });
});
