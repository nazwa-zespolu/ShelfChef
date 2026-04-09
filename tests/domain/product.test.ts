import { Product } from "../../src/app/Product";

describe("Product", () => {
  it("isExpiringSoon returns true when within threshold days", () => {
    const product = new Product({
      id: "uuid-1",
      name: "Mleko",
      expirationDate: new Date("2026-04-10"),
      quantity: 1,
    });

    const result = product.isExpiringSoon(3, new Date("2026-04-08"));

    expect(result).toBe(true);
  });

  it("isExpiringSoon returns false when outside threshold days", () => {
    const product = new Product({
      id: "uuid-2",
      name: "Ryż",
      expirationDate: new Date("2026-06-01"),
      quantity: 2,
    });

    const result = product.isExpiringSoon(3, new Date("2026-04-08"));

    expect(result).toBe(false);
  });

  it("isOpened returns false for fresh product", () => {
    const product = new Product({
      id: "uuid-3",
      name: "Sok pomarańczowy",
      expirationDate: new Date("2026-05-15"),
      quantity: 1,
    });

    expect(product.isOpened()).toBe(false);
  });

  it("markAsOpened sets openedDate", () => {
    const product = new Product({
      id: "uuid-4",
      name: "Ketchup",
      expirationDate: new Date("2026-08-01"),
      quantity: 1,
    });

    product.markAsOpened();

    expect(product.isOpened()).toBe(true);
  });

  it("getFormattedExpiration returns date as readable string", () => {
    const product = new Product({
      id: "uuid-5",
      name: "Masło",
      expirationDate: new Date("2026-04-15"),
      quantity: 1,
    });

    const formatted = product.getFormattedExpiration();

    expect(typeof formatted).toBe("string");
    expect(formatted).toContain("2026");
  });
});
