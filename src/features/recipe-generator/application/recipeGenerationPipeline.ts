import { ProductRepository } from '../../../infrastructure/ProductRepository';
import { LazyDietaryCategorizationService } from './lazyDietaryCategorizationService';
import { RecipeGenerationService } from './recipeGenerationService';
import {
  RecipeGenerationProgressStage,
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
  };
}

export type RecipeGenerationProgressListener = (
  stage: RecipeGenerationProgressStage,
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
    onProgress?.('categorizing');
    const categorization = await this.runCategorizationStage(
      request.categorizationBatchSize ?? 30,
    );

    onProgress?.('generating');
    const ingredients = await this.repository.getRecipeIngredientNames(request.diet);

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
      categorization,
    };
  }

  private async runCategorizationStage(batchSize: number): Promise<{
    attempted: number;
    categorized: number;
    skipped: number;
    retriesUsed: number;
    failed: boolean;
  }> {
    const totals = {
      attempted: 0,
      categorized: 0,
      skipped: 0,
      retriesUsed: 0,
      failed: false,
    };

    try {
      const safeBatchSize = Math.max(1, Math.floor(batchSize));

      while (true) {
        const pending = await this.repository.getItemsPendingDietaryCategorization(
          safeBatchSize,
        );
        if (pending.length === 0) {
          break;
        }

        const { updates, result } =
          await this.lazyDietaryCategorizationService.categorizeBatch(pending);
        totals.attempted += result.attempted;
        totals.categorized += result.categorized;
        totals.skipped += result.skipped;
        totals.retriesUsed += result.retriesUsed;

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
