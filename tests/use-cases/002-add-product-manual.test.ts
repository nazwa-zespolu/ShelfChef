import { AddProductManual } from "../../src/app/AddProductManual";

describe("UC-02: AddProductManual", () => {
  it("saves manually entered product to local database", async () => {
    const databaseService = {
      insertProduct: jest.fn().mockResolvedValue("uuid-456"),
    };

    const addManual = new AddProductManual(databaseService as any);

    const result = await addManual.execute({
      name: "Pomidory",
      category: "Warzywa",
      location: "Lodówka",
      quantity: 3,
      expirationDate: new Date("2026-04-15"),
    });

    expect(databaseService.insertProduct).toHaveBeenCalledTimes(1);
    expect(databaseService.insertProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Pomidory",
        quantity: 3,
      })
    );
    expect(result).toBe("uuid-456");
  });
});
