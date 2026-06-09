import { DishImageResult, DishImageSearchClient } from '../domain/dishImageSearchTypes';
import { parsePixabayImageSearchResponse } from './parsePixabayImageSearchResponse';

const PIXABAY_API_URL = 'https://pixabay.com/api/';
const DEFAULT_TIMEOUT_MS = 10000;

type FetchLike = (
  input: string,
  init?: {
    method?: string;
    signal?: unknown;
  },
) => Promise<{
  ok: boolean;
  json: () => Promise<unknown>;
}>;

export interface PixabayDishImageSearchClientOptions {
  apiKey: string;
  timeoutMs?: number;
  fetchFn?: FetchLike;
  lang?: string;
}

export class PixabayDishImageSearchClient implements DishImageSearchClient {
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: FetchLike;
  private readonly lang: string;

  constructor(options: PixabayDishImageSearchClientOptions) {
    this.apiKey = options.apiKey.trim();
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.lang = options.lang ?? 'pl';
    this.fetchFn =
      options.fetchFn ??
      (() => {
        const maybeFetch = (globalThis as { fetch?: FetchLike }).fetch;
        if (!maybeFetch) {
          throw new Error('Global fetch is not available');
        }
        return maybeFetch;
      })();
  }

  async searchImages(query: string, limit: number): Promise<DishImageResult[]> {
    const trimmedQuery = query.trim();
    if (!trimmedQuery || !this.apiKey) {
      return [];
    }

    const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
    const params = new URLSearchParams({
      key: this.apiKey,
      q: trimmedQuery,
      lang: this.lang,
      image_type: 'photo',
      category: 'food',
      safesearch: 'true',
      per_page: String(safeLimit),
    });

    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      const abortController = new AbortController();
      timeoutId = setTimeout(() => abortController.abort(), this.timeoutMs);
      const response = await this.fetchFn(`${PIXABAY_API_URL}?${params.toString()}`, {
        method: 'GET',
        signal: abortController.signal,
      });

      if (!response.ok) {
        return [];
      }

      const payload = await response.json();
      return parsePixabayImageSearchResponse(payload, safeLimit);
    } catch {
      return [];
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }
}
