import {
  DietPreference,
  DishType,
} from '../domain/recipeGenerationTypes';

const dishTypeLabel: Record<DishType, string> = {
  breakfast: 'breakfast',
  lunch: 'lunch',
  dinner: 'dinner',
  snack: 'snack',
  dessert: 'dessert',
  any: 'any meal type',
};

const dietLabel: Record<DietPreference, string> = {
  none: 'no special diet',
  vegetarian: 'vegetarian',
  vegan: 'vegan',
  'gluten-free': 'gluten-free',
  'dairy-free': 'dairy-free',
  'low-carb': 'low-carb',
};

export const buildRecipeGenerationSystemPrompt = (): string =>
  'You are a recipe ideation assistant. Return ONLY strict JSON in the format {"dishes":["..."]}. ' +
  'No markdown fences, no explanations, and no extra keys. ' +
  'Each array element must be one short dish name string.';

export const buildRecipeGenerationUserPrompt = (params: {
  ingredients: string[];
  dishType: DishType;
  diet: DietPreference;
  maxDishes: number;
}): string =>
  [
    `Dish type target: ${dishTypeLabel[params.dishType]}.`,
    `Dietary preference: ${dietLabel[params.diet]}.`,
    `Propose up to ${params.maxDishes} dishes.`,
    'Use only these pantry ingredients (already filtered for dietary preference; missing extras are allowed):',
    ...params.ingredients.map(item => `- ${item}`),
  ].join('\n');

export const buildRepairPrompt = (rawResponse: string): string =>
  [
    'Convert the following text into strict JSON ONLY in format {"dishes":["..."]}.',
    'Do not add commentary. Keep dish names concise strings.',
    'Text to repair:',
    rawResponse,
  ].join('\n\n');
