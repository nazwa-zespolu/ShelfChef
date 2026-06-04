import { RecipeGenerationPipeline } from '../../../src/features/recipe-generator/application/recipeGenerationPipeline';
import { RecipeGenerationService } from '../../../src/features/recipe-generator/application/recipeGenerationService';
import { LazyDietaryCategorizationService } from '../../../src/features/recipe-generator/application/lazyDietaryCategorizationService';
import { ProductRepository } from '../../../src/infrastructure/ProductRepository';
import { RecipeGenerationError } from '../../../src/features/recipe-generator/domain/recipeGenerationTypes';

const createPipeline = (deps: {
  repository: Partial<ProductRepository>;
  lazyDietaryCategorizationService: Partial<LazyDietaryCategorizationService>;
  complete: jest.Mock<Promise<string>, [string, string]>;
}) => {
  const recipeGenerationService = new RecipeGenerationService({
    modelClient: {
      complete: deps.complete,
    },
    maxParseRetries: 2,
  });

  return new RecipeGenerationPipeline({
    repository: deps.repository as ProductRepository,
    lazyDietaryCategorizationService:
      deps.lazyDietaryCategorizationService as LazyDietaryCategorizationService,
    recipeGenerationService,
  });
};

describe('RecipeGenerationPipeline', () => {
  it('runs happy path end-to-end with dietary filtering', async () => {
    const repository: Partial<ProductRepository> = {
      countItemsPendingDietaryCategorization: jest.fn().mockResolvedValue(1),
      getItemsPendingDietaryCategorization: jest
        .fn()
        .mockResolvedValueOnce([{ productEan: '100', inventoryId: 'inv-1', name: 'Jajka' }])
        .mockResolvedValueOnce([]),
      batchUpdateDietaryCategorization: jest.fn().mockResolvedValue(1),
      getRecipeIngredientNames: jest.fn().mockResolvedValue(['Jajka', 'Marchew']),
    };
    const lazyDietaryCategorizationService: Partial<LazyDietaryCategorizationService> = {
      categorizeBatch: jest.fn().mockResolvedValue({
        result: {
          attempted: 1,
          categorized: 1,
          skipped: 0,
          retriesUsed: 0,
        },
        updates: [
          {
            productEan: '100',
            inventoryId: 'inv-1',
            sourceName: 'Jajka',
            flags: {
              isVegetarian: true,
              isVegan: false,
              isGlutenFree: true,
              isLactoseFree: true,
            },
          },
        ],
      }),
    };
    const complete = jest.fn<Promise<string>, [string, string]>(
      async () => '{"dishes":["Omlet","Jajecznica"]}',
    );
    const pipeline = createPipeline({
      repository,
      lazyDietaryCategorizationService,
      complete,
    });

    const result = await pipeline.run({
      dishType: 'breakfast',
      diet: 'vegetarian',
      maxDishes: 5,
    });

    expect(result.dishes).toEqual(['Omlet', 'Jajecznica']);
    expect(repository.getRecipeIngredientNames).toHaveBeenCalledWith('vegetarian');
    expect(result.categorization).toEqual({
      attempted: 1,
      categorized: 1,
      skipped: 0,
      retriesUsed: 0,
      failed: false,
      skippedStage: false,
    });
  });

  it('skips categorization stage when skipCategorization is true', async () => {
    const repository: Partial<ProductRepository> = {
      countItemsPendingDietaryCategorization: jest.fn(),
      getItemsPendingDietaryCategorization: jest.fn(),
      batchUpdateDietaryCategorization: jest.fn(),
      getRecipeIngredientNames: jest.fn().mockResolvedValue(['Jajka']),
    };
    const lazyDietaryCategorizationService: Partial<LazyDietaryCategorizationService> = {
      categorizeBatch: jest.fn(),
    };
    const complete = jest.fn<Promise<string>, [string, string]>(
      async () => '{"dishes":["Omlet"]}',
    );
    const pipeline = createPipeline({
      repository,
      lazyDietaryCategorizationService,
      complete,
    });

    const result = await pipeline.run({
      dishType: 'dinner',
      diet: 'none',
      skipCategorization: true,
    });

    expect(result.dishes).toEqual(['Omlet']);
    expect(repository.getItemsPendingDietaryCategorization).not.toHaveBeenCalled();
    expect(result.categorization).toEqual({
      attempted: 0,
      categorized: 0,
      skipped: 0,
      retriesUsed: 0,
      failed: false,
      skippedStage: true,
    });
  });

  it('continues recipe generation when categorization stage fails', async () => {
    const repository: Partial<ProductRepository> = {
      countItemsPendingDietaryCategorization: jest.fn().mockResolvedValue(1),
      getItemsPendingDietaryCategorization: jest
        .fn()
        .mockRejectedValue(new Error('db read failed')),
      batchUpdateDietaryCategorization: jest.fn().mockResolvedValue(0),
      getRecipeIngredientNames: jest.fn().mockResolvedValue(['Jajka']),
    };
    const lazyDietaryCategorizationService: Partial<LazyDietaryCategorizationService> = {
      categorizeBatch: jest.fn(),
    };
    const complete = jest.fn<Promise<string>, [string, string]>(
      async () => '{"dishes":["Omlet"]}',
    );
    const pipeline = createPipeline({
      repository,
      lazyDietaryCategorizationService,
      complete,
    });

    const result = await pipeline.run({
      dishType: 'breakfast',
      diet: 'vegetarian',
    });

    expect(result.dishes).toEqual(['Omlet']);
    expect(result.categorization.failed).toBe(true);
  });

  it('throws controlled error after JSON retries are exhausted', async () => {
    const repository: Partial<ProductRepository> = {
      countItemsPendingDietaryCategorization: jest.fn().mockResolvedValue(0),
      getItemsPendingDietaryCategorization: jest.fn().mockResolvedValue([]),
      batchUpdateDietaryCategorization: jest.fn().mockResolvedValue(0),
      getRecipeIngredientNames: jest.fn().mockResolvedValue(['Jajka']),
    };
    const lazyDietaryCategorizationService: Partial<LazyDietaryCategorizationService> = {
      categorizeBatch: jest.fn(),
    };
    const complete = jest
      .fn<Promise<string>, [string, string]>()
      .mockResolvedValue('not-json')
      .mockResolvedValue('still invalid')
      .mockResolvedValue('invalid again');
    const pipeline = createPipeline({
      repository,
      lazyDietaryCategorizationService,
      complete,
    });

    await expect(
      pipeline.run({
        dishType: 'dinner',
        diet: 'none',
      }),
    ).rejects.toMatchObject<Partial<RecipeGenerationError>>({
      name: 'RecipeGenerationError',
      code: 'INVALID_JSON_RESPONSE',
    });
  });
});
