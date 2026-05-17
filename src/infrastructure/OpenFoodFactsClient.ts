import { ProductDefinition } from "../domain/types";

export type SupportedEan = string;
type FetchLike = (input: string, init?: { method?: string; signal?: unknown }) => Promise<{
  status: number;
  ok: boolean;
  json: () => Promise<unknown>;
}>;

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

interface OpenFoodFactsProductDto {
  code?: string;
  product_name?: string;
  brands?: string;
  image_url?: string;
  categories?: string;
}

interface OpenFoodFactsLookupResponse {
  status?: number;
  product?: OpenFoodFactsProductDto;
}

export interface HttpOpenFoodFactsClientOptions {
  timeoutMs?: number;
  baseUrl?: string;
  fetchFn?: FetchLike;
}

export class HttpOpenFoodFactsClient implements OpenFoodFactsClient {
  private readonly timeoutMs: number;
  private readonly baseUrl: string;
  private readonly fetchFn: FetchLike;

  constructor(options: HttpOpenFoodFactsClientOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.baseUrl = options.baseUrl ?? "https://world.openfoodfacts.org/api/v2";
    this.fetchFn =
      options.fetchFn ??
      (() => {
        const maybeFetch = (globalThis as { fetch?: FetchLike }).fetch;
        if (!maybeFetch) {
          throw new NetworkError("Global fetch is not available");
        }
        return maybeFetch;
      })();
  }

  async fetchProductByEAN(ean: SupportedEan): Promise<ProductDefinition> {
    assertValidEan(ean);
    const normalizedEan = ean.trim();
    const url = `${this.baseUrl}/product/${normalizedEan}.json`;

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), this.timeoutMs);

    try {
      const response = await this.fetchFn(url, {
        method: "GET",
        signal: abortController.signal,
      });

      if (response.status === 404 || response.status === 410) {
        throw new NotFoundError(normalizedEan);
      }

      if (response.status === 429) {
        throw new RateLimitError();
      }

      if (response.status >= 500) {
        throw new UpstreamError(response.status);
      }

      if (!response.ok) {
        throw new UpstreamError(response.status);
      }

      const payload = (await response.json()) as OpenFoodFactsLookupResponse;
      const product = payload.product;
      const hasProduct = payload.status === 1 && product;

      if (!hasProduct) {
        throw new NotFoundError(normalizedEan);
      }

      return this.mapProduct(normalizedEan, product);
    } catch (error: unknown) {
      if (error instanceof OpenFoodFactsClientError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new TimeoutError();
      }

      if (error instanceof Error) {
        throw new NetworkError(error.message);
      }

      throw new NetworkError("Unexpected network failure");
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private mapProduct(ean: string, product: OpenFoodFactsProductDto): ProductDefinition {
    const name = product.product_name?.trim();

    if (!name) {
      throw new NotFoundError(ean);
    }

    const category = product.categories
      ?.split(",")
      .map(part => part.trim())
      .filter(Boolean)[0];
    const brand = product.brands
      ?.split(",")
      .map(part => part.trim())
      .filter(Boolean)[0];

    return {
      ean,
      name,
      brand,
      imageUrl: product.image_url?.trim(),
      category,
    };
  }
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
