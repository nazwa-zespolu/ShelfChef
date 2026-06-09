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
'You are an expert culinary AI. Suggest REAL, ESTABLISHED global dishes based on the ingredients provided.\n\n' +
  'CRITICAL RULES:\n' +
  '1. EXTREME DIVERSITY: Each of the 5 dishes MUST be completely different. Use different cuisines and different main ingredients for each dish.\n' +
  '2. CLASSICS ONLY: Name well-known, traditional dishes (e.g., "Chicken Parmesan", "Pasta Arrabiata", "Cheese Omelette").\n' +
  '3. CLEAN NAMES: Do not copy exact brands or specific product names from the input list into the dish name.\n' +
  '4. Return ONLY valid JSON in this exact format: {"dishes":["Dish 1", "Dish 2", "Dish 3", "Dish 4", "Dish 5"]}.\n\n' +
  'EXAMPLE INPUT:\n' +
  '- Chicken Breast Fillet\n' +
  '- Chopped Tomatoes (canned)\n' +
  '- Gochujang Pasta\n' +
  '- Spaghetti Pasta\n' +
  '- Free-range Eggs\n' +
  '- Coca Cola Zero\n\n' +
  'EXAMPLE OUTPUT:\n' +
  '{"dishes": ["Classic Spaghetti Pomodoro", "Korean Spicy Chicken", "Shakshuka", "Chicken Milanese", "Egg Fried Rice"]}\n\n' +
  'Now, process the user\'s input following this exact logic.';


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
