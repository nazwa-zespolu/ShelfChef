import {
  HttpOpenFoodFactsClient,
  NotFoundError,
  RateLimitError,
  ServiceUnavailableError,
  TimeoutError,
} from "../../src/infrastructure/OpenFoodFactsClient";

type FetchResponse = {
  status: number;
  ok: boolean;
  json: () => Promise<unknown>;
};
type FetchInit = { method?: string; signal?: unknown; headers?: Record<string, string> };

describe("HttpOpenFoodFactsClient", () => {
  it("returns mapped product definition for valid OFF response", async () => {
    const fetchFn = jest.fn<Promise<FetchResponse>, [string, FetchInit?]>(
      async () => ({
        status: 200,
        ok: true,
        json: async () => ({
          status: 1,
          product: {
            product_name: "Jogurt naturalny",
            brands: "Mlekovita,Inna marka",
            categories: "Nabial,Inne",
            image_url: "https://img/jogurt.png",
          },
        }),
      }),
    );

    const client = new HttpOpenFoodFactsClient({
      fetchFn,
    });

    const result = await client.fetchProductByEAN("5901234567890");

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining(
        "/product/5901234567890.json?fields=product_name%2Cbrands%2Ccategories%2Cimage_url",
      ),
      expect.anything(),
    );
    expect(result).toEqual({
      ean: "5901234567890",
      name: "Jogurt naturalny",
      brand: "Mlekovita",
      category: "Nabial",
      imageUrl: "https://img/jogurt.png",
    });
  });

  it("throws TimeoutError when fetch is aborted by timeout", async () => {
    const fetchFn = jest.fn().mockImplementation((_url, init: FetchInit | undefined) => {
      const signal = init?.signal as AbortSignal | undefined;

      return new Promise((_resolve, reject) => {
        if (!signal) {
          reject(new Error("signal is required"));
          return;
        }

        signal.addEventListener("abort", () => {
          const abortError = new Error("Aborted");
          abortError.name = "AbortError";
          reject(abortError);
        });
      });
    });

    const client = new HttpOpenFoodFactsClient({
      fetchFn,
      timeoutMs: 5,
    });

    await expect(client.fetchProductByEAN("5901234567890")).rejects.toBeInstanceOf(
      TimeoutError,
    );
  });

  it("throws RateLimitError when upstream returns 429", async () => {
    const fetchFn = jest.fn<Promise<FetchResponse>, [string, FetchInit?]>(
      async () => ({
        status: 429,
        ok: false,
        json: async () => ({}),
      }),
    );

    const client = new HttpOpenFoodFactsClient({
      fetchFn,
    });

    await expect(client.fetchProductByEAN("5901234567890")).rejects.toBeInstanceOf(
      RateLimitError,
    );
  });

  it("throws NotFoundError when OFF does not contain product", async () => {
    const fetchFn = jest.fn<Promise<FetchResponse>, [string, FetchInit?]>(
      async () => ({
        status: 200,
        ok: true,
        json: async () => ({
          status: 0,
        }),
      }),
    );

    const client = new HttpOpenFoodFactsClient({
      fetchFn,
    });

    await expect(client.fetchProductByEAN("5901234567890")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("throws ServiceUnavailableError when upstream returns 503", async () => {
    const fetchFn = jest.fn<Promise<FetchResponse>, [string, FetchInit?]>(async () => ({
      status: 503,
      ok: false,
      json: async () => ({}),
    }));

    const client = new HttpOpenFoodFactsClient({ fetchFn });

    await expect(client.fetchProductByEAN("5901234567890")).rejects.toBeInstanceOf(
      ServiceUnavailableError,
    );
  });

  it("uses default local rate limit of 15 requests per minute", async () => {
    const fetchFn = jest.fn<Promise<FetchResponse>, [string, FetchInit?]>(
      async () => ({
        status: 200,
        ok: true,
        json: async () => ({
          status: 1,
          product: {
            product_name: "Mleko",
          },
        }),
      }),
    );

    const client = new HttpOpenFoodFactsClient({ fetchFn });

    for (let i = 0; i < 15; i += 1) {
      await expect(client.fetchProductByEAN("5901234567890")).resolves.toEqual(
        expect.objectContaining({
          ean: "5901234567890",
          name: "Mleko",
        }),
      );
    }

    await expect(client.fetchProductByEAN("5901234567890")).rejects.toBeInstanceOf(
      RateLimitError,
    );
    expect(fetchFn).toHaveBeenCalledTimes(15);
  });

  it("sends custom User-Agent header in OFF requests", async () => {
    const fetchFn = jest.fn<Promise<FetchResponse>, [string, FetchInit?]>(async () => ({
      status: 200,
      ok: true,
      json: async () => ({
        status: 1,
        product: {
          product_name: "Ser",
        },
      }),
    }));

    const client = new HttpOpenFoodFactsClient({
      fetchFn,
      userAgent: "MDstudy/1.0 (team@example.com)",
    });

    await client.fetchProductByEAN("5901234567890");

    expect(fetchFn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          "User-Agent": "MDstudy/1.0 (team@example.com)",
        }),
      }),
    );
  });
});
