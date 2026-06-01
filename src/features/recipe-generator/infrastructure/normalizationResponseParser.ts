const extractJsonCandidate = (raw: string): string => {
  const text = raw.trim();
  if (!text) {
    return '';
  }

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const startObj = text.indexOf('{');
  const endObj = text.lastIndexOf('}');
  if (startObj !== -1 && endObj > startObj) {
    return text.slice(startObj, endObj + 1).trim();
  }

  return text;
};

export class InvalidNormalizationResponseError extends Error {
  constructor(message = 'Invalid normalization response JSON') {
    super(message);
    this.name = 'InvalidNormalizationResponseError';
  }
}

export const parseNormalizationResponse = (raw: string): Record<string, string> => {
  const direct = raw.trim();
  const candidate = extractJsonCandidate(direct);
  const options = [direct, candidate];

  for (const option of options) {
    if (!option) {
      continue;
    }

    try {
      const parsed = JSON.parse(option) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        continue;
      }

      const out: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof key !== 'string' || typeof value !== 'string') {
          continue;
        }

        const sourceName = key.trim();
        const normalizedName = value.trim();
        if (!sourceName || !normalizedName) {
          continue;
        }
        out[sourceName] = normalizedName;
      }
      return out;
    } catch {
      // Try the next candidate variant.
    }
  }

  throw new InvalidNormalizationResponseError();
};
