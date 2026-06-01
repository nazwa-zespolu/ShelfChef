import {
  LazyNormalizationBatchResult,
  NormalizationCandidate,
  NormalizationModelClient,
  NormalizedProductName,
} from '../domain/normalizationTypes';
import { buildNormalizationPrompt } from '../infrastructure/normalizationPromptBuilder';
import {
  InvalidNormalizationResponseError,
  parseNormalizationResponse,
} from '../infrastructure/normalizationResponseParser';

export interface LazyNormalizationServiceOptions {
  modelClient: NormalizationModelClient;
  maxParseRetries?: number;
}

export class LazyNormalizationService {
  private readonly modelClient: NormalizationModelClient;
  private readonly maxParseRetries: number;

  constructor(options: LazyNormalizationServiceOptions) {
    this.modelClient = options.modelClient;
    this.maxParseRetries = options.maxParseRetries ?? 2;
  }

  async normalizeBatch(
    candidates: NormalizationCandidate[],
  ): Promise<{ result: LazyNormalizationBatchResult; mappings: NormalizedProductName[] }> {
    if (candidates.length === 0) {
      return {
        result: { attempted: 0, normalized: 0, skipped: 0, retriesUsed: 0 },
        mappings: [],
      };
    }

    const { systemPrompt, userPrompt } = buildNormalizationPrompt(candidates);
    let retriesUsed = 0;
    let parsed: Record<string, string> | null = null;

    for (let attempt = 0; attempt <= this.maxParseRetries; attempt += 1) {
      const rawResponse = await this.modelClient.complete(systemPrompt, userPrompt);
      try {
        parsed = parseNormalizationResponse(rawResponse);
        break;
      } catch (error) {
        if (!(error instanceof InvalidNormalizationResponseError)) {
          throw error;
        }
        if (attempt === this.maxParseRetries) {
          break;
        }
        retriesUsed += 1;
      }
    }

    if (!parsed) {
      return {
        result: {
          attempted: candidates.length,
          normalized: 0,
          skipped: candidates.length,
          retriesUsed,
        },
        mappings: [],
      };
    }

    const mappings: NormalizedProductName[] = candidates
      .map(candidate => {
        const normalizedName = parsed?.[candidate.name]?.trim();
        if (!normalizedName) {
          return null;
        }
        return {
          ean: candidate.ean,
          sourceName: candidate.name,
          normalizedName,
        };
      })
      .filter((entry): entry is NormalizedProductName => entry !== null);

    return {
      result: {
        attempted: candidates.length,
        normalized: mappings.length,
        skipped: candidates.length - mappings.length,
        retriesUsed,
      },
      mappings,
    };
  }
}
