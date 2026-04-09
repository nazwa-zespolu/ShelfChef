import { DefaultExpiryPolicy } from "../src/domain/policies/DefaultExpiryPolicy";

describe("DefaultExpiryPolicy", () => {
  it("returns true when expiration date is within threshold", () => {
    const policy = new DefaultExpiryPolicy(3);
    const now = new Date("2026-04-08T10:00:00.000Z");
    const expirationDate = new Date("2026-04-10T10:00:00.000Z");

    expect(policy.isExpiringSoon(expirationDate, now)).toBe(true);
  });

  it("returns false when expiration date is outside threshold", () => {
    const policy = new DefaultExpiryPolicy(3);
    const now = new Date("2026-04-08T10:00:00.000Z");
    const expirationDate = new Date("2026-04-20T10:00:00.000Z");

    expect(policy.isExpiringSoon(expirationDate, now)).toBe(false);
  });
});
