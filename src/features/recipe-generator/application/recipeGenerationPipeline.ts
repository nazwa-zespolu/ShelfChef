import { ProductRepository } from '../../../infrastructure/ProductRepository';
import { LazyNormalizationService } from './lazyNormalizationService';
import { RecipeGenerationService } from './recipeGenerationService';
import {
  RecipeGenerationProgressStage,
  RecipeGenerationRequest,
  RecipeGenerationResult,
} from '../domain/recipeGenerationTypes';

export interface RecipeGenerationPipelineResult extends RecipeGenerationResult {
  normalization: {
    attempted: number;
    normalized: number;
    skipped: number;
    retriesUsed: number;
    failed: boolean;
  };
}

export type RecipeGenerationProgressListener = (
  stage: RecipeGenerationProgressStage,
) => void;

export interface RecipeGenerationPipelineOptions {
  repository: ProductRepository;
  lazyNormalizationService: LazyNormalizationService;
  recipeGenerationService: RecipeGenerationService;
}

export class RecipeGenerationPipeline {
  private readonly repository: ProductRepository;
  private readonly lazyNormalizationService: LazyNormalizationService;
  private readonly recipeGenerationService: RecipeGenerationService;

  constructor(options: RecipeGenerationPipelineOptions) {
    this.repository = options.repository;
    this.lazyNormalizationService = options.lazyNormalizationService;
    this.recipeGenerationService = options.recipeGenerationService;
  }

  async run(
    request: RecipeGenerationRequest,
    onProgress?: RecipeGenerationProgressListener,
  ): Promise<RecipeGenerationPipelineResult> {
    onProgress?.('normalizing');
    const normalization = await this.runNormalizationStage(
      request.normalizationBatchSize ?? 30,
    );

    onProgress?.('generating');
    const ingredients = await this.repository.getRecipeIngredientNames();

    onProgress?.('parsing');
    const generation = await this.recipeGenerationService.generate({
      ingredients,
      dishType: request.dishType,
      diet: request.diet,
      maxDishes: request.maxDishes,
    });

    onProgress?.('done');
    return {
      ...generation,
      normalization,
    };
  }

  private async runNormalizationStage(batchSize: number): Promise<{
    attempted: number;
    normalized: number;
    skipped: number;
    retriesUsed: number;
    failed: boolean;
  }> {
    const totals = {
      attempted: 0,
      normalized: 0,
      skipped: 0,
      retriesUsed: 0,
      failed: false,
    };

    try {
      const safeBatchSize = Math.max(1, Math.floor(batchSize));

      while (true) {
        const pending = await this.repository.getDefinitionsPendingNormalization(
          safeBatchSize,
        );
        if (pending.length === 0) {
          break;
        }

        const { mappings, result } =
          await this.lazyNormalizationService.normalizeBatch(pending);
        totals.attempted += result.attempted;
        totals.normalized += result.normalized;
        totals.skipped += result.skipped;
        totals.retriesUsed += result.retriesUsed;

        if (mappings.length > 0) {
          await this.repository.batchUpdateNormalizedNames(
            mappings.map(item => ({
              ean: item.ean,
              normalizedName: item.normalizedName,
            })),
          );
        }

        if (mappings.length === 0) {
          break;
        }
      }
    } catch {
      totals.failed = true;
    }

    return totals;
  }
}
