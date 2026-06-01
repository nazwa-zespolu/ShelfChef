import { RecipeGenerationPipeline } from '../../../src/features/recipe-generator/application/recipeGenerationPipeline';
import { RecipeGenerationService } from '../../../src/features/recipe-generator/application/recipeGenerationService';
import { LazyNormalizationService } from '../../../src/features/recipe-generator/application/lazyNormalizationService';
import { ProductRepository } from '../../../src/infrastructure/ProductRepository';
import { RecipeGenerationError } from '../../../src/features/recipe-generator/domain/recipeGenerationTypes';

const createPipeline = (deps: {
  repository: Partial<ProductRepository>;
  lazyNormalizationService: Partial<LazyNormalizationService>;
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
    lazyNormalizationService:
      deps.lazyNormalizationService as LazyNormalizationService,
    recipeGenerationService,
  });
};

describe('RecipeGenerationPipeline', () => {
  it('runs happy path end-to-end', async () => {
    const repository: Partial<ProductRepository> = {
      getDefinitionsPendingNormalization: jest
        .fn()
        .mockResolvedValueOnce([{ ean: '100', name: 'Mleko UHT 3.2%' }])
        .mockResolvedValueOnce([]),
      batchUpdateNormalizedNames: jest.fn().mockResolvedValue(1),
      getRecipeIngredientNames: jest
        .fn()
        .mockResolvedValue(['milk', 'onion', 'spaghetti']),
    };
    const lazyNormalizationService: Partial<LazyNormalizationService> = {
      normalizeBatch: jest.fn().mockResolvedValue({
        result: {
          attempted: 1,
          normalized: 1,
          skipped: 0,
          retriesUsed: 0,
        },
        mappings: [
          { ean: '100', sourceName: 'Mleko UHT 3.2%', normalizedName: 'milk' },
        ],
      }),
    };
    const complete = jest.fn<Promise<string>, [string, string]>(
      async () => '{"dishes":["Pasta primavera","Onion soup"]}',
    );
    const pipeline = createPipeline({
      repository,
      lazyNormalizationService,
      complete,
    });

    const result = await pipeline.run({
      dishType: 'dinner',
      diet: 'vegetarian',
      maxDishes: 5,
    });

    expect(result.dishes).toEqual(['Pasta primavera', 'Onion soup']);
    expect(result.normalization).toEqual({
      attempted: 1,
      normalized: 1,
      skipped: 0,
      retriesUsed: 0,
      failed: false,
    });
    expect(repository.batchUpdateNormalizedNames).toHaveBeenCalledWith([
      { ean: '100', normalizedName: 'milk' },
    ]);
  });

  it('continues recipe generation when normalization stage fails', async () => {
    const repository: Partial<ProductRepository> = {
      getDefinitionsPendingNormalization: jest
        .fn()
        .mockRejectedValue(new Error('db read failed')),
      batchUpdateNormalizedNames: jest.fn().mockResolvedValue(0),
      getRecipeIngredientNames: jest.fn().mockResolvedValue(['eggs', 'butter']),
    };
    const lazyNormalizationService: Partial<LazyNormalizationService> = {
      normalizeBatch: jest.fn(),
    };
    const complete = jest.fn<Promise<string>, [string, string]>(
      async () => '{"dishes":["Scrambled eggs"]}',
    );
    const pipeline = createPipeline({
      repository,
      lazyNormalizationService,
      complete,
    });

    const result = await pipeline.run({
      dishType: 'breakfast',
      diet: 'none',
    });

    expect(result.dishes).toEqual(['Scrambled eggs']);
    expect(result.normalization.failed).toBe(true);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('throws controlled error after JSON retries are exhausted', async () => {
    const repository: Partial<ProductRepository> = {
      getDefinitionsPendingNormalization: jest.fn().mockResolvedValue([]),
      batchUpdateNormalizedNames: jest.fn().mockResolvedValue(0),
      getRecipeIngredientNames: jest.fn().mockResolvedValue(['milk']),
    };
    const lazyNormalizationService: Partial<LazyNormalizationService> = {
      normalizeBatch: jest.fn(),
    };
    const complete = jest
      .fn<Promise<string>, [string, string]>()
      .mockResolvedValueOnce('not-json')
      .mockResolvedValueOnce('still invalid')
      .mockResolvedValueOnce('invalid again');
    const pipeline = createPipeline({
      repository,
      lazyNormalizationService,
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
    expect(complete).toHaveBeenCalledTimes(3);
  });
});
