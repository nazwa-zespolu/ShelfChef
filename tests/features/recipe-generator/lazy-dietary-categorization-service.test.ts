import { LazyDietaryCategorizationService } from '../../../src/features/recipe-generator/application/lazyDietaryCategorizationService';
import { DietaryCategorizationModelClient } from '../../../src/features/recipe-generator/domain/dietaryCategorizationTypes';

const CANDIDATES = [
  { productEan: '1', name: 'Jajka' },
  { inventoryId: 'inv-2', name: 'Domowy sos' },
];

describe('LazyDietaryCategorizationService', () => {
  it('maps valid dietary flags from parsed JSON', async () => {
    const modelClient: DietaryCategorizationModelClient = {
      complete: jest.fn(async (_systemPrompt, _userPrompt, kind) => {
        expect(kind).toBe('dietary-categorization');
        return JSON.stringify({
          Jajka: {
            is_vegetarian: true,
            is_vegan: false,
            is_gluten_free: true,
            is_lactose_free: true,
          },
        });
      }),
    };
    const service = new LazyDietaryCategorizationService({ modelClient });

    const { result, updates } = await service.categorizeBatch(CANDIDATES);

    expect(result.categorized).toBe(1);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      productEan: '1',
      sourceName: 'Jajka',
      flags: {
        isVegetarian: true,
        isVegan: false,
        isGlutenFree: true,
        isLactoseFree: true,
      },
    });
  });
});
