import { DeleteProduct } from "../../src/app/DeleteProduct";

describe("UC-03: DeleteProduct", () => {
  it("deletes product from database by id", async () => {
    const databaseService = {
      deleteProduct: jest.fn().mockResolvedValue(undefined),
    };

    const deleteProduct = new DeleteProduct(databaseService as any);

    await deleteProduct.execute("uuid-123");

    expect(databaseService.deleteProduct).toHaveBeenCalledWith("uuid-123");
  });
});
