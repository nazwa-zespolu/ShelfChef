import {
  RecipeGenerationError,
  RecipeGenerationModelClient,
  RecipeGenerationResult,
} from '../domain/recipeGenerationTypes';
import {
  buildRecipeGenerationSystemPrompt,
  buildRecipeGenerationUserPrompt,
  buildRepairPrompt,
} from '../infrastructure/recipeGenerationPromptBuilder';
import {
  InvalidRecipeGenerationResponseError,
  parseRecipeGenerationResponse,
} from '../infrastructure/recipeGenerationResponseParser';
import { DietPreference, DishType } from '../domain/recipeGenerationTypes';

export interface RecipeGenerationServiceOptions {
  modelClient: RecipeGenerationModelClient;
  maxParseRetries?: number;
}

export interface GenerateRecipeInput {
  ingredients: string[];
  dishType: DishType;
  diet: DietPreference;
  maxDishes?: number;
}

export class RecipeGenerationService {
  private readonly modelClient: RecipeGenerationModelClient;
  private readonly maxParseRetries: number;

  constructor(options: RecipeGenerationServiceOptions) {
    this.modelClient = options.modelClient;
    this.maxParseRetries = options.maxParseRetries ?? 2;
  }

  async generate(input: GenerateRecipeInput): Promise<RecipeGenerationResult> {
    const cleanIngredients = input.ingredients
      .map(item => item.trim())
      .filter(Boolean);

    if (cleanIngredients.length === 0) {
      throw new RecipeGenerationError(
        'EMPTY_PANTRY',
        'Cannot generate dishes because ingredient list is empty.',
      );
    }

    const maxDishes = Math.max(1, Math.min(30, input.maxDishes ?? 5));
    const systemPrompt = buildRecipeGenerationSystemPrompt();
    let userPrompt = buildRecipeGenerationUserPrompt({
      ingredients: cleanIngredients,
      dishType: input.dishType,
      diet: input.diet,
      maxDishes,
    });

    let retriesUsed = 0;
    let lastRawResponse = '';
    let completionKind: 'recipe-generation' | 'json-repair' = 'recipe-generation';

    for (let attempt = 0; attempt <= this.maxParseRetries; attempt += 1) {
      try {
        lastRawResponse = await this.modelClient.complete(
          systemPrompt,
          userPrompt,
          completionKind,
        );
      } catch (error) {
        throw new RecipeGenerationError(
          'MODEL_FAILURE',
          'Model request failed during recipe generation.',
          String(error),
        );
      }

      try {
        const dishes = parseRecipeGenerationResponse(lastRawResponse).slice(0, maxDishes);
        return {
          dishes,
          rawResponse: lastRawResponse,
          retriesUsed,
        };
      } catch (error) {
        if (!(error instanceof InvalidRecipeGenerationResponseError)) {
          throw new RecipeGenerationError(
            'MODEL_FAILURE',
            'Unexpected error while parsing model response.',
            String(error),
          );
        }
        if (attempt === this.maxParseRetries) {
          throw new RecipeGenerationError(
            'INVALID_JSON_RESPONSE',
            'Model did not return valid JSON in required {"dishes":["..."]} format.',
            lastRawResponse,
          );
        }
        retriesUsed += 1;
        userPrompt = buildRepairPrompt(lastRawResponse);
        completionKind = 'json-repair';
      }
    }

    throw new RecipeGenerationError(
      'INVALID_JSON_RESPONSE',
      'Model did not return valid JSON in required {"dishes":["..."]} format.',
      lastRawResponse,
    );
  }
}
