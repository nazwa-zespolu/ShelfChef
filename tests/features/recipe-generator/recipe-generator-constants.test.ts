import {
  getGenerationConfigForKind,
  LLM_SAMPLING_BY_KIND,
} from '../../../src/features/recipe-generator/recipeGeneratorConstants';

describe('recipeGeneratorConstants', () => {
  it('maps sampling params per completion kind', () => {
    expect(LLM_SAMPLING_BY_KIND['dietary-categorization']).toEqual({
      temperature: 0.1,
      topP: 0.9,
    });
    expect(LLM_SAMPLING_BY_KIND['recipe-generation']).toEqual({
      temperature: 0.5,
      topP: 0.9,
    });
    expect(getGenerationConfigForKind('dietary-categorization')).toMatchObject({
      temperature: 0.1,
      topP: 0.9,
      outputTokenBatchSize: 32,
      batchTimeInterval: 500,
    });
    expect(getGenerationConfigForKind('recipe-generation')).toMatchObject({
      temperature: 0.5,
      topP: 0.9,
      outputTokenBatchSize: 32,
      batchTimeInterval: 500,
    });
  });
});
