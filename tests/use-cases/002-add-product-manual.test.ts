import { AddProductManual } from "../../src/app/AddProductManual";

describe("UC-02: AddProductManual", () => {
  it("saves product and its template to local database", async () => {
    const databaseService = {
      insertTemplate: jest.fn().mockResolvedValue("template-1"),
      insertProduct: jest.fn().mockResolvedValue("uuid-456"),
    };

    const addManual = new AddProductManual(databaseService as any);

    const result = await addManual.execute({
      name: "Pomidory",
      category: "Warzywa",
      location: "Lodówka",
      expirationDate: new Date("2026-04-15"),
    });

    expect(databaseService.insertTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Pomidory",
        category: "Warzywa",
      })
    );
    expect(databaseService.insertProduct).toHaveBeenCalledTimes(1);
    expect(databaseService.insertProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Pomidory",
      })
    );
    expect(result).toBe("uuid-456");
  });
});
