export interface DishImageResult {
  imageUrl: string;
  sourcePageUrl?: string;
  sourceName?: string;
  title?: string;
}

export interface DishImageSearchClient {
  searchImages(query: string, limit: number): Promise<DishImageResult[]>;
}
