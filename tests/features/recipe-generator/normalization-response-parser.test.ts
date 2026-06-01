import {
  InvalidNormalizationResponseError,
  parseNormalizationResponse,
} from '../../../src/features/recipe-generator/infrastructure/normalizationResponseParser';

describe('parseNormalizationResponse', () => {
  it('parses strict JSON dictionary', () => {
    const result = parseNormalizationResponse(
      '{"Mleko UHT 3.2%":"milk","Cebula":"onion"}',
    );

    expect(result).toEqual({
      'Mleko UHT 3.2%': 'milk',
      Cebula: 'onion',
    });
  });

  it('parses JSON wrapped in markdown fence', () => {
    const result = parseNormalizationResponse(
      '```json\n{"Makaron spaghetti":"spaghetti","Jajka":"eggs"}\n```',
    );

    expect(result).toEqual({
      'Makaron spaghetti': 'spaghetti',
      Jajka: 'eggs',
    });
  });

  it('throws for malformed JSON', () => {
    expect(() =>
      parseNormalizationResponse('{"Makaron":"spaghetti", "Jajka": }'),
    ).toThrow(InvalidNormalizationResponseError);
  });
});
