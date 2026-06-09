import {
  DietaryCategorizationCandidate,
  DietaryCategorizationModelClient,
  DietaryCategorizationUpdate,
  DietaryFlags,
  LazyDietaryCategorizationBatchResult,
} from '../domain/dietaryCategorizationTypes';
import { buildDietaryCategorizationPrompt } from '../infrastructure/dietaryCategorizationPromptBuilder';
import {
  InvalidDietaryCategorizationResponseError,
  parseDietaryCategorizationResponse,
} from '../infrastructure/dietaryCategorizationResponseParser';

export interface LazyDietaryCategorizationServiceOptions {
  modelClient: DietaryCategorizationModelClient;
  maxParseRetries?: number;
}

export class LazyDietaryCategorizationService {
  private readonly modelClient: DietaryCategorizationModelClient;
  private readonly maxParseRetries: number;

  constructor(options: LazyDietaryCategorizationServiceOptions) {
    this.modelClient = options.modelClient;
    this.maxParseRetries = options.maxParseRetries ?? 2;
  }

  async categorizeBatch(
    candidates: DietaryCategorizationCandidate[],
  ): Promise<{
    result: LazyDietaryCategorizationBatchResult;
    updates: DietaryCategorizationUpdate[];
  }> {
    if (candidates.length === 0) {
      return {
        result: { attempted: 0, categorized: 0, skipped: 0, retriesUsed: 0 },
        updates: [],
      };
    }

    const { systemPrompt, userPrompt } = buildDietaryCategorizationPrompt(candidates);
    let retriesUsed = 0;
    let parsed: Record<string, DietaryFlags> | null = null;

    for (let attempt = 0; attempt <= this.maxParseRetries; attempt += 1) {
      const rawResponse = await this.modelClient.complete(
        systemPrompt,
        userPrompt,
        'dietary-categorization',
      );
      try {
        parsed = parseDietaryCategorizationResponse(rawResponse);
        break;
      } catch (error) {
        if (!(error instanceof InvalidDietaryCategorizationResponseError)) {
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
          categorized: 0,
          skipped: candidates.length,
          retriesUsed,
        },
        updates: [],
      };
    }

    const updates: DietaryCategorizationUpdate[] = [];
    for (const candidate of candidates) {
      const flags = parsed?.[candidate.name];
      if (!flags) {
        continue;
      }
      updates.push({
        productEan: candidate.productEan,
        inventoryId: candidate.inventoryId,
        sourceName: candidate.name,
        flags,
      });
    }

    return {
      result: {
        attempted: candidates.length,
        categorized: updates.length,
        skipped: candidates.length - updates.length,
        retriesUsed,
      },
      updates,
    };
  }
}
