import {
  InvalidDietaryCategorizationResponseError,
  parseDietaryCategorizationResponse,
} from '../../../src/features/recipe-generator/infrastructure/dietaryCategorizationResponseParser';

describe('parseDietaryCategorizationResponse', () => {
  it('parses strict JSON dictionary with dietary flags', () => {
    const result = parseDietaryCategorizationResponse(
      `{
        "Filet z piersi kurczaka": { "is_vegetarian": false, "is_vegan": false, "is_gluten_free": true, "is_lactose_free": true },
        "Jajka": { "is_vegetarian": true, "is_vegan": false, "is_gluten_free": true, "is_lactose_free": true }
      }`,
    );

    expect(result['Filet z piersi kurczaka']).toEqual({
      isVegetarian: false,
      isVegan: false,
      isGlutenFree: true,
      isLactoseFree: true,
    });
  });

  it('throws for malformed JSON', () => {
    expect(() =>
      parseDietaryCategorizationResponse('{"Jajka": { "is_vegan": true }}'),
    ).toThrow(InvalidDietaryCategorizationResponseError);
  });
});
