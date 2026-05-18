import { SlidingWindowRateLimiter } from "../../src/infrastructure/OpenFoodFactsRateLimiter";

describe("SlidingWindowRateLimiter", () => {
  it("allows requests up to configured limit", () => {
    const limiter = new SlidingWindowRateLimiter({
      maxRequests: 2,
      windowMs: 60_000,
      now: () => 1_000,
    });

    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(false);
  });

  it("allows requests again after the window has passed", () => {
    let currentTime = 0;
    const limiter = new SlidingWindowRateLimiter({
      maxRequests: 2,
      windowMs: 1_000,
      now: () => currentTime,
    });

    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(false);

    currentTime = 1_001;
    expect(limiter.tryConsume()).toBe(true);
  });

  it("throws for invalid constructor options", () => {
    expect(
      () =>
        new SlidingWindowRateLimiter({
          maxRequests: 0,
          windowMs: 1_000,
        }),
    ).toThrow("maxRequests must be a positive integer");

    expect(
      () =>
        new SlidingWindowRateLimiter({
          maxRequests: 1,
          windowMs: 0,
        }),
    ).toThrow("windowMs must be a positive integer");
  });
});
