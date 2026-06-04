import {
  BIELIK_V3_0_1_5B_QUANTIZED,
  Message,
  QWEN2_5_1_5B_QUANTIZED,
  QWEN2_5_3B_QUANTIZED,
} from 'react-native-executorch';

export type RecipeModelId = 'qwen3b' | 'qwen1_5b' | 'bielik';

export type DietPreference = 'none' | 'vegetarian' | 'vegan' | 'gluten_free' | 'lactose_free';

export type MealType =
  | 'breakfast'
  | 'lunch'
  | 'dinner'
  | 'dessert'
  | 'snack_sweet'
  | 'snack_salty';

export type LlmModelConfig =
  | typeof QWEN2_5_3B_QUANTIZED
  | typeof QWEN2_5_1_5B_QUANTIZED
  | typeof BIELIK_V3_0_1_5B_QUANTIZED;

export type RecipeModelOption = {
  id: RecipeModelId;
  config: LlmModelConfig;
  title: string;
  subtitle: string;
  sizeHint: string;
};

export const RECIPE_MODEL_OPTIONS: RecipeModelOption[] = [
  {
    id: 'qwen3b',
    config: QWEN2_5_3B_QUANTIZED,
    title: 'Angielski — mocniejsze telefony',
    subtitle: 'Qwen 2.5 3B — lepsza jakość propozycji',
    sizeHint: 'ok. 3 GB',
  },
  {
    id: 'qwen1_5b',
    config: QWEN2_5_1_5B_QUANTIZED,
    title: 'Angielski — słabsze telefony',
    subtitle: 'Qwen 2.5 1.5B — szybszy, mniejszy model',
    sizeHint: 'ok. 1 GB',
  },
  {
    id: 'bielik',
    config: BIELIK_V3_0_1_5B_QUANTIZED,
    title: 'Polski',
    subtitle: 'Bielik 3.0 1.5B — propozycje po polsku',
    sizeHint: 'ok. 1 GB',
  },
];

export const DIET_OPTIONS: {id: DietPreference; label: string}[] = [
  {id: 'none', label: 'Bez ograniczeń'},
  {id: 'vegetarian', label: 'Wegetariańska'},
  {id: 'vegan', label: 'Wegańska'},
  {id: 'gluten_free', label: 'Bezglutenowa'},
  {id: 'lactose_free', label: 'Bez laktozy'},
];

export const MEAL_OPTIONS: {id: MealType; label: string}[] = [
  {id: 'breakfast', label: 'Śniadanie'},
  {id: 'lunch', label: 'Obiad'},
  {id: 'dinner', label: 'Kolacja'},
  {id: 'dessert', label: 'Deser'},
  {id: 'snack_sweet', label: 'Przekąska słodka'},
  {id: 'snack_salty', label: 'Przekąska słona'},
];

const MODEL_BY_ID: Record<RecipeModelId, LlmModelConfig> = {
  qwen3b: QWEN2_5_3B_QUANTIZED,
  qwen1_5b: QWEN2_5_1_5B_QUANTIZED,
  bielik: BIELIK_V3_0_1_5B_QUANTIZED,
};

const MEAL_LABEL_PL: Record<MealType, string> = {
  breakfast: 'śniadanie',
  lunch: 'obiad',
  dinner: 'kolacja',
  dessert: 'deser',
  snack_sweet: 'przekąska słodka',
  snack_salty: 'przekąska słona',
};

const MEAL_LABEL_EN: Record<MealType, string> = {
  breakfast: 'breakfast',
  lunch: 'lunch',
  dinner: 'dinner',
  dessert: 'dessert',
  snack_sweet: 'sweet snack',
  snack_salty: 'savory snack',
};

function dietConstraintPl(diet: DietPreference): string {
  switch (diet) {
    case 'vegetarian':
      return 'Dieta wegetariańska — bez mięsa i ryb.';
    case 'vegan':
      return 'Dieta wegańska — bez produktów pochodzenia zwierzęcego.';
    case 'gluten_free':
      return 'Dieta bezglutenowa — bez glutenu.';
    case 'lactose_free':
      return 'Dieta bez laktozy — bez laktozy.';
    default:
      return '';
  }
}

function dietConstraintEn(diet: DietPreference): string {
  switch (diet) {
    case 'vegetarian':
      return 'Vegetarian diet — no meat or fish.';
    case 'vegan':
      return 'Vegan diet — no animal products.';
    case 'gluten_free':
      return 'Gluten-free diet — no gluten.';
    case 'lactose_free':
      return 'Lactose-free diet — no lactose.';
    default:
      return '';
  }
}

export function isRecipeModelId(value: string | null | undefined): value is RecipeModelId {
  return value === 'qwen3b' || value === 'qwen1_5b' || value === 'bielik';
}

export function getRecipeModelConfig(id: RecipeModelId): LlmModelConfig {
  return MODEL_BY_ID[id];
}

export function modelFileNameFromConfig(config: LlmModelConfig): string | null {
  return config.modelSource.split('/').pop()?.toLowerCase() ?? null;
}

export function buildRecipeMessages(
  modelId: RecipeModelId,
  ingredients: string[],
  diet: DietPreference,
  mealType: MealType,
): Message[] {
  const list = ingredients.map(x => `- ${x}`).join('\n');
  const dietPl = dietConstraintPl(diet);
  const dietEn = dietConstraintEn(diet);

  if (modelId === 'bielik') {
    const system: Message = {
      role: 'system',
      content:
        'Jesteś asystentem kuchennym. Odpowiadaj WYŁĄCZNIE JSON w formacie {"dishes":["..."]}.' +
        ' Bez komentarzy, bez Markdown, bez dodatkowych pól. Tylko nazwy dań.' +
        ' Każdy element tablicy dishes MUSI być pojedynczym stringiem (nazwa dania), nie obiektem.' +
        ' Proponuj tylko dania możliwe do przygotowania z podanych składników.' +
        (dietPl ? ` ${dietPl}` : ''),
    };
    const user: Message = {
      role: 'user',
      content:
        `Moje składniki:\n${list}\n\n` +
        `Typ posiłku: ${MEAL_LABEL_PL[mealType]}.\n` +
        'Zaproponuj 5 dań pasujących do tego typu posiłku. Brakujące składniki można dokupić. ' +
        'Zwróć tylko JSON zgodnie z instrukcją.',
    };
    return [system, user];
  }

  const system: Message = {
    role: 'system',
    content:
      'You are a kitchen assistant. Respond ONLY with JSON in the format {"dishes":["..."]}.' +
      ' No comments, no Markdown, no extra fields. Only dish names.' +
      ' Each element of the dishes array MUST be a single string (the dish name), not an object.' +
      ' Suggest only dishes that can be made using the given ingredients.' +
      (dietEn ? ` ${dietEn}` : ''),
  };
  const user: Message = {
    role: 'user',
    content:
      `My ingredients:\n${list}\n\n` +
      `Meal type: ${MEAL_LABEL_EN[mealType]}.\n` +
      'Propose 5 dishes suitable for this meal type. Missing ingredients can be bought. ' +
      'Return only JSON as instructed.',
  };
  return [system, user];
}
