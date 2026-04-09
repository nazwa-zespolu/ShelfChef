import { Product } from "../../src/app/Product";

describe("Product", () => {
  it("isExpiringSoon returns true when within threshold days", () => {
    const product = new Product({
      id: "uuid-1",
      name: "Mleko",
      expirationDate: new Date("2026-04-10"),
      openedDate: null,
    });

    const result = product.isExpiringSoon(3, new Date("2026-04-08"));

    expect(result).toBe(true);
  });

  it("isExpiringSoon returns false when outside threshold days", () => {
    const product = new Product({
      id: "uuid-2",
      name: "Ryż",
      expirationDate: new Date("2026-06-01"),
      openedDate: null,
    });

    const result = product.isExpiringSoon(3, new Date("2026-04-08"));

    expect(result).toBe(false);
  });

  it("isOpened returns false when openedDate is null", () => {
    const product = new Product({
      id: "uuid-3",
      name: "Sok pomarańczowy",
      expirationDate: new Date("2026-05-15"),
      openedDate: null,
    });

    expect(product.isOpened()).toBe(false);
    expect(product.openedDate).toBeNull();
  });

  it("markAsOpened sets openedDate", () => {
    const product = new Product({
      id: "uuid-4",
      name: "Ketchup",
      expirationDate: new Date("2026-08-01"),
      openedDate: null,
    });

    product.markAsOpened();

    expect(product.isOpened()).toBe(true);
    expect(product.openedDate).toBeInstanceOf(Date);
  });

  it("getFormattedExpiration returns date as readable string", () => {
    const product = new Product({
      id: "uuid-5",
      name: "Masło",
      expirationDate: new Date("2026-04-15"),
      openedDate: null,
    });

    const formatted = product.getFormattedExpiration();

    expect(typeof formatted).toBe("string");
    expect(formatted).toContain("2026");
  });
});
