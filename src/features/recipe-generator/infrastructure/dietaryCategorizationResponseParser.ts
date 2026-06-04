import { DietaryFlags } from '../domain/dietaryCategorizationTypes';

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

export class InvalidDietaryCategorizationResponseError extends Error {
  constructor(message = 'Invalid dietary categorization response JSON') {
    super(message);
    this.name = 'InvalidDietaryCategorizationResponseError';
  }
}

const readBooleanFlag = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 1 || value === '1' || value === 'true') {
    return true;
  }
  if (value === 0 || value === '0' || value === 'false') {
    return false;
  }
  return null;
};

const parseFlagsObject = (value: unknown): DietaryFlags | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const row = value as Record<string, unknown>;
  const isVegetarian = readBooleanFlag(row.is_vegetarian);
  const isVegan = readBooleanFlag(row.is_vegan);
  const isGlutenFree = readBooleanFlag(row.is_gluten_free);
  const isLactoseFree = readBooleanFlag(row.is_lactose_free);

  if (
    isVegetarian == null ||
    isVegan == null ||
    isGlutenFree == null ||
    isLactoseFree == null
  ) {
    return null;
  }

  return {
    isVegetarian,
    isVegan,
    isGlutenFree,
    isLactoseFree,
  };
};

export const parseDietaryCategorizationResponse = (
  raw: string,
): Record<string, DietaryFlags> => {
  const candidate = extractJsonCandidate(raw);
  if (!candidate) {
    throw new InvalidDietaryCategorizationResponseError();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    throw new InvalidDietaryCategorizationResponseError();
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new InvalidDietaryCategorizationResponseError();
  }

  const out: Record<string, DietaryFlags> = {};
  for (const [key, value] of Object.entries(parsed)) {
    const sourceName = key.trim();
    if (!sourceName) {
      continue;
    }
    const flags = parseFlagsObject(value);
    if (!flags) {
      continue;
    }
    out[sourceName] = flags;
  }

  if (Object.keys(out).length === 0) {
    throw new InvalidDietaryCategorizationResponseError();
  }

  return out;
};
