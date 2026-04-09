import { getExpiringProducts } from "../../src/app/getExpiringProducts";

describe("UC-04: getExpiringProducts", () => {
  it("returns only products expiring within 2 days, sorted by date ascending", async () => {
    const databaseService = {
      queryAllProducts: jest.fn().mockResolvedValue([
        { id: "1", name: "Ryż", expirationDate: new Date("2026-06-01") },
        { id: "2", name: "Mleko", expirationDate: new Date("2026-04-09") },
        { id: "3", name: "Jogurt", expirationDate: new Date("2026-04-10") },
      ]),
    };

    const now = new Date("2026-04-08");
    const result = await getExpiringProducts(databaseService as any, now);

    expect(databaseService.queryAllProducts).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Mleko");
    expect(result[1].name).toBe("Jogurt");
  });

  it("excludes products without expiration date", async () => {
    const databaseService = {
      queryAllProducts: jest.fn().mockResolvedValue([
        { id: "1", name: "Sól", expirationDate: null },
        { id: "2", name: "Mleko", expirationDate: new Date("2026-04-09") },
      ]),
    };

    const now = new Date("2026-04-08");
    const result = await getExpiringProducts(databaseService as any, now);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Mleko");
  });
});
