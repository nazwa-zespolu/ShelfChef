const extractJsonCandidate = (raw: string): string => {
  const text = raw.trim();
  if (!text) {
    return '';
  }

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    return text.slice(start, end + 1).trim();
  }

  return text;
};

export class InvalidRecipeGenerationResponseError extends Error {
  constructor(message = 'Invalid recipe generation response JSON') {
    super(message);
    this.name = 'InvalidRecipeGenerationResponseError';
  }
}

export const parseRecipeGenerationResponse = (raw: string): string[] => {
  const candidate = extractJsonCandidate(raw);
  if (!candidate) {
    throw new InvalidRecipeGenerationResponseError();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    throw new InvalidRecipeGenerationResponseError();
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new InvalidRecipeGenerationResponseError();
  }

  const dishesRaw = (parsed as { dishes?: unknown }).dishes;
  if (!Array.isArray(dishesRaw)) {
    throw new InvalidRecipeGenerationResponseError();
  }

  const dishes = dishesRaw
    .map(item => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);

  if (dishes.length === 0) {
    throw new InvalidRecipeGenerationResponseError();
  }

  return dishes;
};
