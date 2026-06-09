import { DietaryCategorizationCandidate } from '../domain/dietaryCategorizationTypes';

export interface DietaryCategorizationPrompt {
  systemPrompt: string;
  userPrompt: string;
}

export const DIETARY_CATEGORIZATION_SYSTEM_PROMPT = `You are a data categorization AI. Evaluate food products (which may be in Polish, English, Italian, or other languages) for dietary compliance.

RULES:
- is_vegetarian: true if NO meat, fish, or poultry.
- is_vegan: true if NO animal products (no meat, dairy, eggs, honey).
- is_gluten_free: true if NO wheat (pszenica), barley, rye. Standard pasta/flour is false.
- is_lactose_free: true if NO dairy milk, butter, cheese, whey.

Return ONLY raw JSON. Do NOT wrap in \`\`\`json.

EXAMPLES:

Input:
- Filet z piersi kurczaka
- Mozzarella di bufala
- Jajka
- Bratwurst
- Makaron pszenny
- Mleko krowie
- Tofu

Output:
{
  "Filet z piersi kurczaka": { "is_vegetarian": false, "is_vegan": false, "is_gluten_free": true, "is_lactose_free": true },
  "Mozzarella di bufala": { "is_vegetarian": true, "is_vegan": false, "is_gluten_free": true, "is_lactose_free": false },
  "Jajka": { "is_vegetarian": true, "is_vegan": false, "is_gluten_free": true, "is_lactose_free": true },
  "Bratwurst": { "is_vegetarian": false, "is_vegan": false, "is_gluten_free": true, "is_lactose_free": true },
  "Makaron pszenny": { "is_vegetarian": true, "is_vegan": true, "is_gluten_free": false, "is_lactose_free": true },
  "Mleko krowie": { "is_vegetarian": true, "is_vegan": false, "is_gluten_free": true, "is_lactose_free": false },
  "Tofu": { "is_vegetarian": true, "is_vegan": true, "is_gluten_free": true, "is_lactose_free": true }
}

Now evaluate the user's input based strictly on these rules and examples.`;

export const buildDietaryCategorizationPrompt = (
  candidates: DietaryCategorizationCandidate[],
): DietaryCategorizationPrompt => ({
  systemPrompt: DIETARY_CATEGORIZATION_SYSTEM_PROMPT,
  userPrompt:
    'Input:\n' +
    candidates
      .map(item => item.name.trim())
      .filter(Boolean)
      .map(name => `- ${name}`)
      .join('\n'),
});
