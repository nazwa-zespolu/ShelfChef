import {
  BIELIK_V3_0_1_5B_QUANTIZED,
  Message,
  QWEN2_5_1_5B_QUANTIZED,
  QWEN2_5_3B_QUANTIZED,
} from 'react-native-executorch';

export type RecipeModelId = 'qwen3b' | 'qwen1_5b' | 'bielik';

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

const MODEL_BY_ID: Record<RecipeModelId, LlmModelConfig> = {
  qwen3b: QWEN2_5_3B_QUANTIZED,
  qwen1_5b: QWEN2_5_1_5B_QUANTIZED,
  bielik: BIELIK_V3_0_1_5B_QUANTIZED,
};

export function isRecipeModelId(value: string | null | undefined): value is RecipeModelId {
  return value === 'qwen3b' || value === 'qwen1_5b' || value === 'bielik';
}

export function getRecipeModelConfig(id: RecipeModelId): LlmModelConfig {
  return MODEL_BY_ID[id];
}

export function modelFileNameFromConfig(config: LlmModelConfig): string | null {
  return config.modelSource.split('/').pop()?.toLowerCase() ?? null;
}

export function buildRecipeMessages(modelId: RecipeModelId, ingredients: string[]): Message[] {
  const list = ingredients.map(x => `- ${x}`).join('\n');

  if (modelId === 'bielik') {
    const system: Message = {
      role: 'system',
      content:
        'Jesteś asystentem kuchennym. Odpowiadaj WYŁĄCZNIE JSON w formacie {"dishes":["..."]}.' +
        ' Bez komentarzy, bez Markdown, bez dodatkowych pól. Tylko nazwy dań.' +
        ' Każdy element tablicy dishes MUSI być pojedynczym stringiem (nazwa dania), nie obiektem.' +
        ' Proponuj tylko dania możliwe do przygotowania ze podanych składników.',
    };
    const user: Message = {
      role: 'user',
      content:
        'Moje składniki:\n' +
        list +
        '\n\nZaproponuj 5 dań. Brakujące składniki można dokupić. Zwróć tylko JSON zgodnie z instrukcją.',
    };
    return [system, user];
  }

  const system: Message = {
    role: 'system',
    content:
      'You are a kitchen assistant. Respond ONLY with JSON in the format {"dishes":["..."]}.' +
      ' No comments, no Markdown, no extra fields. Only dish names.' +
      ' Each element of the dishes array MUST be a single string (the dish name), not an object.' +
      ' Suggest only dishes that can be made using the given ingredients.',
  };
  const user: Message = {
    role: 'user',
    content:
      'My ingredients:\n' +
      list +
      '\n\nPropose 5 dishes. Missing ingredients can be bought. Return only JSON as instructed.',
  };
  return [system, user];
}
