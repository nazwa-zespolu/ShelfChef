import { LlmCompletionKind } from '../recipeGeneratorConstants';
import { DietPreference } from './recipeGenerationTypes';

export interface DietaryFlags {
  isVegetarian: boolean;
  isVegan: boolean;
  isGlutenFree: boolean;
  isLactoseFree: boolean;
}

export interface DietaryCategorizationCandidate {
  productEan?: string;
  inventoryId?: string;
  name: string;
}

export interface DietaryCategorizationUpdate {
  productEan?: string;
  inventoryId?: string;
  sourceName: string;
  flags: DietaryFlags;
}

export interface DietaryCategorizationModelClient {
  complete(
    systemPrompt: string,
    userPrompt: string,
    kind: Extract<LlmCompletionKind, 'dietary-categorization'>,
  ): Promise<string>;
}

export interface LazyDietaryCategorizationBatchResult {
  attempted: number;
  categorized: number;
  skipped: number;
  retriesUsed: number;
}

export function matchesDietPreference(
  flags: DietaryFlags | null,
  diet: DietPreference,
): boolean {
  if (diet === 'none' || diet === 'low-carb') {
    return true;
  }
  if (!flags) {
    return false;
  }

  switch (diet) {
    case 'vegetarian':
      return flags.isVegetarian;
    case 'vegan':
      return flags.isVegan;
    case 'gluten-free':
      return flags.isGlutenFree;
    case 'dairy-free':
      return flags.isLactoseFree;
    default:
      return true;
  }
}
