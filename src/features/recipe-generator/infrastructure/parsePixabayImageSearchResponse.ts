import { DishImageResult } from '../domain/dishImageSearchTypes';

interface PixabayHitDto {
  webformatURL?: string;
  previewURL?: string;
  pageURL?: string;
  tags?: string;
  user?: string;
}

export function parsePixabayImageSearchResponse(
  payload: unknown,
  limit: number,
): DishImageResult[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const hits = (payload as { hits?: PixabayHitDto[] }).hits;
  if (!Array.isArray(hits)) {
    return [];
  }

  const results: DishImageResult[] = [];
  const seen = new Set<string>();
  const safeLimit = Math.max(1, Math.floor(limit));

  for (const hit of hits) {
    const imageUrl = hit.webformatURL?.trim() || hit.previewURL?.trim();
    if (!imageUrl || seen.has(imageUrl)) {
      continue;
    }

    seen.add(imageUrl);
    const user = hit.user?.trim();
    results.push({
      imageUrl,
      sourcePageUrl: hit.pageURL?.trim() || undefined,
      sourceName: user ? `Pixabay · ${user}` : 'Pixabay',
      title: hit.tags?.trim() || undefined,
    });

    if (results.length >= safeLimit) {
      break;
    }
  }

  return results;
}
