export interface NormalizationCandidate {
  ean: string;
  name: string;
}

export interface NormalizedProductName {
  ean: string;
  sourceName: string;
  normalizedName: string;
}

export interface NormalizationModelClient {
  complete(systemPrompt: string, userPrompt: string): Promise<string>;
}

export interface LazyNormalizationBatchResult {
  attempted: number;
  normalized: number;
  skipped: number;
  retriesUsed: number;
}
