export type DishType =
  | 'breakfast'
  | 'lunch'
  | 'dinner'
  | 'snack'
  | 'dessert'
  | 'any';

export type DietPreference =
  | 'none'
  | 'vegetarian'
  | 'vegan'
  | 'gluten-free'
  | 'dairy-free'
  | 'low-carb';

export type RecipeGenerationProgressStage =
  | 'categorizing'
  | 'generating'
  | 'parsing'
  | 'done';

export interface RecipeGenerationRequest {
  dishType: DishType;
  diet: DietPreference;
  maxDishes?: number;
  categorizationBatchSize?: number;
}

export interface RecipeGenerationResult {
  dishes: string[];
  rawResponse: string;
  retriesUsed: number;
}

export interface RecipeGenerationModelClient {
  complete(systemPrompt: string, userPrompt: string): Promise<string>;
}

export type RecipeGenerationErrorCode =
  | 'EMPTY_PANTRY'
  | 'INVALID_JSON_RESPONSE'
  | 'MODEL_FAILURE';

export class RecipeGenerationError extends Error {
  readonly code: RecipeGenerationErrorCode;
  readonly causeMessage?: string;

  constructor(
    code: RecipeGenerationErrorCode,
    message: string,
    causeMessage?: string,
  ) {
    super(message);
    this.name = 'RecipeGenerationError';
    this.code = code;
    this.causeMessage = causeMessage;
  }
}
