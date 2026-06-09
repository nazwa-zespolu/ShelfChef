import { GenerationConfig } from 'react-native-executorch';
import { PIXABAY_API_KEY } from '@env';

export const categorizationBatchSize = 1;
export const maxDishes = 5;
export const dishImagesPerResult = 5;

/** Klucz z pliku src/.env (PIXABAY_API_KEY). Szablon: .env.example */
export function getPixabayApiKey(): string {
  return (PIXABAY_API_KEY ?? '').trim();
}
export type LlmCompletionKind =
  | 'dietary-categorization'
  | 'recipe-generation'
  | 'json-repair'
  | 'unknown';

export const LLM_SHARED_GENERATION_CONFIG: Pick<
  GenerationConfig,
  'outputTokenBatchSize' | 'batchTimeInterval'
> = {
  outputTokenBatchSize: 32,
  batchTimeInterval: 500,
};

export const LLM_SAMPLING_BY_KIND: Record<
  LlmCompletionKind,
  Pick<GenerationConfig, 'temperature' | 'topP'>
> = {
  'dietary-categorization': { temperature: 0.1, topP: 0.9 },
  'recipe-generation': { temperature: 0.45, topP: 0.9 },
  'json-repair': { temperature: 0.1, topP: 0.9 },
  unknown: { temperature: 0.35, topP: 0.5 },
};

export const LLM_MAX_TOKENS_BY_KIND: Record<LlmCompletionKind, number> = {
  'dietary-categorization': 70 * categorizationBatchSize,
  'recipe-generation': 60 * maxDishes,
  'json-repair': 500,
  unknown: 900,
};

export function getGenerationConfigForKind(
  kind: LlmCompletionKind,
): GenerationConfig {
  return {
    ...LLM_SHARED_GENERATION_CONFIG,
    ...LLM_SAMPLING_BY_KIND[kind],
  };
}
