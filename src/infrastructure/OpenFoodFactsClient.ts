import { ProductDefinition } from "../domain/types";

export type SupportedEan = string;

export class OpenFoodFactsClientError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

export class InvalidEanError extends OpenFoodFactsClientError {
  constructor(ean: string) {
    super(`Invalid EAN format: ${ean}`, "INVALID_EAN");
  }
}

export class TimeoutError extends OpenFoodFactsClientError {
  constructor(message = "Open Food Facts request timed out") {
    super(message, "TIMEOUT");
  }
}

export class NetworkError extends OpenFoodFactsClientError {
  constructor(message = "Network error while calling Open Food Facts API") {
    super(message, "NETWORK");
  }
}

export class RateLimitError extends OpenFoodFactsClientError {
  constructor(message = "Open Food Facts request limit exceeded") {
    super(message, "RATE_LIMIT");
  }
}

export class NotFoundError extends OpenFoodFactsClientError {
  constructor(ean: string) {
    super(`Product not found for EAN: ${ean}`, "NOT_FOUND");
  }
}

export class UpstreamError extends OpenFoodFactsClientError {
  constructor(status: number, message = "Open Food Facts API returned an error") {
    super(`${message} (status: ${status})`, "UPSTREAM");
  }
}

/**
 * Contract for product lookup by EAN in Open Food Facts.
 * Success: returns normalized ProductDefinition.
 * Failure: rejects with one of OpenFoodFactsClientError subclasses.
 */
export interface OpenFoodFactsClient {
  fetchProductByEAN(ean: SupportedEan): Promise<ProductDefinition>;
}

/**
 * Validates EAN accepted by OFF.
 * Supports EAN-8 and EAN-13.
 */
export const assertValidEan = (ean: string): void => {
  const normalized = ean.trim();
  const isValid = /^\d{8}$/.test(normalized) || /^\d{13}$/.test(normalized);

  if (!isValid) {
    throw new InvalidEanError(ean);
  }
};
