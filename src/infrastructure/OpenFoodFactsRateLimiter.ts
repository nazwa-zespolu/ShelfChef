export interface OpenFoodFactsRateLimiter {
  tryConsume(): boolean;
}

export interface SlidingWindowRateLimiterOptions {
  maxRequests: number;
  windowMs: number;
  now?: () => number;
}

export class SlidingWindowRateLimiter implements OpenFoodFactsRateLimiter {
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly requestTimestamps: number[] = [];

  constructor(options: SlidingWindowRateLimiterOptions) {
    if (!Number.isInteger(options.maxRequests) || options.maxRequests <= 0) {
      throw new Error("maxRequests must be a positive integer");
    }

    if (!Number.isInteger(options.windowMs) || options.windowMs <= 0) {
      throw new Error("windowMs must be a positive integer");
    }

    this.maxRequests = options.maxRequests;
    this.windowMs = options.windowMs;
    this.now = options.now ?? (() => Date.now());
  }

  tryConsume(): boolean {
    const currentTime = this.now();
    this.evictExpiredRequests(currentTime);

    if (this.requestTimestamps.length >= this.maxRequests) {
      return false;
    }

    this.requestTimestamps.push(currentTime);
    return true;
  }

  private evictExpiredRequests(currentTime: number): void {
    while (
      this.requestTimestamps.length > 0 &&
      currentTime - this.requestTimestamps[0] >= this.windowMs
    ) {
      this.requestTimestamps.shift();
    }
  }
}
