import { ProductRepository } from '../../../infrastructure/ProductRepository';
import { LazyDietaryCategorizationService } from './lazyDietaryCategorizationService';
import { RecipeGenerationService } from './recipeGenerationService';
import {
  CategorizationProgress,
  RecipeGenerationProgressEvent,
  RecipeGenerationRequest,
  RecipeGenerationResult,
} from '../domain/recipeGenerationTypes';

export interface RecipeGenerationPipelineResult extends RecipeGenerationResult {
  categorization: {
    attempted: number;
    categorized: number;
    skipped: number;
    retriesUsed: number;
    failed: boolean;
    skippedStage: boolean;
  };
}

export type RecipeGenerationProgressListener = (
  event: RecipeGenerationProgressEvent,
) => void;

export interface RecipeGenerationPipelineOptions {
  repository: ProductRepository;
  lazyDietaryCategorizationService: LazyDietaryCategorizationService;
  recipeGenerationService: RecipeGenerationService;
}

export class RecipeGenerationPipeline {
  private readonly repository: ProductRepository;
  private readonly lazyDietaryCategorizationService: LazyDietaryCategorizationService;
  private readonly recipeGenerationService: RecipeGenerationService;

  constructor(options: RecipeGenerationPipelineOptions) {
    this.repository = options.repository;
    this.lazyDietaryCategorizationService = options.lazyDietaryCategorizationService;
    this.recipeGenerationService = options.recipeGenerationService;
  }

  async run(
    request: RecipeGenerationRequest,
    onProgress?: RecipeGenerationProgressListener,
  ): Promise<RecipeGenerationPipelineResult> {
    const emit = (event: RecipeGenerationProgressEvent) => {
      onProgress?.(event);
    };

    const categorization = request.skipCategorization
      ? {
          attempted: 0,
          categorized: 0,
          skipped: 0,
          retriesUsed: 0,
          failed: false,
          skippedStage: true,
        }
      : await this.runCategorizationStage(
          request.categorizationBatchSize ?? 30,
          progress => emit({ stage: 'categorizing', categorization: progress }),
        );

    emit({ stage: 'generating' });
    const ingredients = await this.repository.getRecipeIngredientNames(request.diet);

    emit({ stage: 'parsing' });
    const generation = await this.recipeGenerationService.generate({
      ingredients,
      dishType: request.dishType,
      diet: request.diet,
      maxDishes: request.maxDishes,
    });

    emit({ stage: 'done' });
    return {
      ...generation,
      categorization,
    };
  }

  private async runCategorizationStage(
    batchSize: number,
    onCategorizationProgress: (progress: CategorizationProgress) => void,
  ): Promise<{
    attempted: number;
    categorized: number;
    skipped: number;
    retriesUsed: number;
    failed: boolean;
    skippedStage: boolean;
  }> {
    const totals = {
      attempted: 0,
      categorized: 0,
      skipped: 0,
      retriesUsed: 0,
      failed: false,
      skippedStage: false,
    };

    try {
      const safeBatchSize = Math.max(1, Math.floor(batchSize));
      const totalPending =
        await this.repository.countItemsPendingDietaryCategorization();
      onCategorizationProgress({ completed: 0, total: totalPending });

      while (true) {
        const pending = await this.repository.getItemsPendingDietaryCategorization(
          safeBatchSize,
        );
        if (pending.length === 0) {
          onCategorizationProgress({
            completed: totalPending,
            total: totalPending,
          });
          break;
        }

        const { updates, result } =
          await this.lazyDietaryCategorizationService.categorizeBatch(pending);
        totals.attempted += result.attempted;
        totals.categorized += result.categorized;
        totals.skipped += result.skipped;
        totals.retriesUsed += result.retriesUsed;

        onCategorizationProgress({
          completed: Math.min(totalPending, totals.attempted),
          total: totalPending,
        });

        if (updates.length > 0) {
          await this.repository.batchUpdateDietaryCategorization(updates);
        }

        if (updates.length === 0) {
          break;
        }
      }
    } catch {
      totals.failed = true;
    }

    return totals;
  }
}
