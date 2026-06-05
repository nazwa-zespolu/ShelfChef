import { DishImageSearchService } from '../../../src/features/recipe-generator/application/dishImageSearchService';
import { parsePixabayImageSearchResponse } from '../../../src/features/recipe-generator/infrastructure/parsePixabayImageSearchResponse';
import { PixabayDishImageSearchClient } from '../../../src/features/recipe-generator/infrastructure/pixabayDishImageSearchClient';

describe('parsePixabayImageSearchResponse', () => {
  it('maps hits to dish image results with Pixabay attribution', () => {
    const payload = {
      hits: [
        {
          webformatURL: 'https://pixabay.com/get/photo-a.jpg',
          pageURL: 'https://pixabay.com/photos/omlet-1/',
          tags: 'omelet, egg, breakfast',
          user: 'ChefPhotos',
        },
        {
          previewURL: 'https://pixabay.com/get/preview-b.jpg',
          pageURL: 'https://pixabay.com/photos/salad-2/',
          user: 'Veggie',
        },
        {
          webformatURL: 'https://pixabay.com/get/photo-a.jpg',
        },
      ],
    };

    expect(parsePixabayImageSearchResponse(payload, 5)).toEqual([
      {
        imageUrl: 'https://pixabay.com/get/photo-a.jpg',
        sourcePageUrl: 'https://pixabay.com/photos/omlet-1/',
        sourceName: 'Pixabay · ChefPhotos',
        title: 'omelet, egg, breakfast',
      },
      {
        imageUrl: 'https://pixabay.com/get/preview-b.jpg',
        sourcePageUrl: 'https://pixabay.com/photos/salad-2/',
        sourceName: 'Pixabay · Veggie',
        title: undefined,
      },
    ]);
  });
});

describe('PixabayDishImageSearchClient', () => {
  it('queries Pixabay food photos in Polish', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        hits: [
          {
            webformatURL: 'https://pixabay.com/get/omlet.jpg',
            pageURL: 'https://pixabay.com/photos/omlet/',
            user: 'Anna',
            tags: 'omlet',
          },
        ],
      }),
    });

    const client = new PixabayDishImageSearchClient({
      apiKey: 'test-key',
      fetchFn,
    });
    const images = await client.searchImages('omlet food', 5);

    expect(images).toHaveLength(1);
    const calledUrl = String(fetchFn.mock.calls[0][0]);
    expect(calledUrl).toContain('pixabay.com/api/');
    expect(calledUrl).toContain('key=test-key');
    expect(calledUrl).toContain('q=omlet+food');
    expect(calledUrl).toContain('lang=pl');
    expect(calledUrl).toContain('category=food');
    expect(calledUrl).toContain('image_type=photo');
  });

  it('returns empty list when api key is missing', async () => {
    const fetchFn = jest.fn();
    const client = new PixabayDishImageSearchClient({ apiKey: '', fetchFn });

    await expect(client.searchImages('omlet', 5)).resolves.toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('DishImageSearchService', () => {
  it('builds a food-focused query for stock photos', async () => {
    const searchImages = jest.fn().mockResolvedValue([]);
    const service = new DishImageSearchService({ searchImages });

    await service.searchImagesForDish('Omlet z warzywami', 5);

    expect(searchImages).toHaveBeenCalledWith('Omlet z warzywami food', 5);
  });
});
