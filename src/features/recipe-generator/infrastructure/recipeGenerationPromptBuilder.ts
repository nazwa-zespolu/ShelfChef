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
  'You are a kitchen assistant. Respond ONLY with JSON in the format {"dishes":["..."]}.' +
        ' No comments, no Markdown, no extra fields. Only dish names.' +
        ' Each element of the dishes array MUST be a single string (the dish name), not an object.' +
        ' Suggest only dishes that can be made using given ingredients.';

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
    'If some ingredients are missing its ok. Here are the ingredients:',
    ...params.ingredients.map(item => `- ${item}`),
  ].join('\n');

export const buildRepairPrompt = (rawResponse: string): string =>
  [
    'Convert the following text into strict JSON ONLY in format {"dishes":["..."]}.',
    'Do not add commentary. Keep dish names concise strings.',
    'Text to repair:',
    rawResponse,
  ].join('\n\n');
