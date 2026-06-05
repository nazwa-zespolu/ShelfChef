import { getPixabayApiKey as getBuiltInPixabayApiKey } from '../recipeGeneratorConstants';

export function resolvePixabayApiKey(userKey?: string | null): string {
  return (userKey?.trim() || getBuiltInPixabayApiKey()).trim();
}

export function isDishImageSearchConfigured(userKey?: string | null): boolean {
  return resolvePixabayApiKey(userKey).length > 0;
}
