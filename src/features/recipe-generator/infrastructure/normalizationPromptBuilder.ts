import { NormalizationCandidate } from '../domain/normalizationTypes';

export interface NormalizationPrompt {
  systemPrompt: string;
  userPrompt: string;
}

export const buildNormalizationPrompt = (
  candidates: NormalizationCandidate[],
): NormalizationPrompt => {
  const safeCandidates = candidates
    .map(item => item.name.trim())
    .filter(Boolean);

  return {
    systemPrompt:
      'You normalize ingredient names. Return ONLY valid JSON with no markdown fences. ' +
      'Output must be a single JSON object where each key is an original ingredient name and each value is a concise English core ingredient ' +
      '(for example: "Mleko UHT 3.2%" -> "milk", "Makaron spaghetti" -> "spaghetti"). ' +
      'Use lowercase singular nouns when possible.',
    userPrompt:
      'Normalize the following ingredient names and return only the JSON dictionary.\n\n' +
      safeCandidates.map(name => `- ${name}`).join('\n'),
  };
};
