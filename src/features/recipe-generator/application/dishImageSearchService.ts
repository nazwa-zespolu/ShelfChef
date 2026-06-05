import { DishImageResult, DishImageSearchClient } from '../domain/dishImageSearchTypes';
import { PixabayDishImageSearchClient } from '../infrastructure/pixabayDishImageSearchClient';
import { dishImagesPerResult, getPixabayApiKey } from '../recipeGeneratorConstants';

export class DishImageSearchService {
  private readonly client: DishImageSearchClient;

  constructor(client: DishImageSearchClient) {
    this.client = client;
  }

  async searchImagesForDish(
    dishName: string,
    limit = dishImagesPerResult,
  ): Promise<DishImageResult[]> {
    const trimmedName = dishName.trim();
    if (!trimmedName) {
      return [];
    }

    const query = `${trimmedName} food`;
    return this.client.searchImages(query, limit);
  }
}

let cachedService: DishImageSearchService | null = null;

export function getDishImageSearchService(): DishImageSearchService {
  if (!cachedService) {
    cachedService = new DishImageSearchService(
      new PixabayDishImageSearchClient({
        apiKey: getPixabayApiKey(),
      }),
    );
  }
  return cachedService;
}
