import {
  detectChatTemplateLeak,
  sanitizeLlmCompletion,
} from '../../../src/features/recipe-generator/infrastructure/llmCompletionGuard';

describe('llmCompletionGuard', () => {
  it('truncates response at chat template leak marker', () => {
    const raw =
      '{"dishes":["Omlet"]}<|im_start|>user\nYou are a data categorization AI...';
    expect(sanitizeLlmCompletion(raw)).toBe('{"dishes":["Omlet"]}');
    expect(detectChatTemplateLeak(raw)).toBe(true);
  });

  it('keeps valid JSON when no leak markers are present', () => {
    const raw = '{"Jajka":{"is_vegetarian":true,"is_vegan":false,"is_gluten_free":true,"is_lactose_free":true}}';
    expect(sanitizeLlmCompletion(raw)).toBe(raw);
    expect(detectChatTemplateLeak(raw)).toBe(false);
  });
});
