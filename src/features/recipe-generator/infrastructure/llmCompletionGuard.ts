import { GenerationConfig, Message } from 'react-native-executorch';
import {
  getGenerationConfigForKind,
  LlmCompletionKind,
  LLM_MAX_TOKENS_BY_KIND,
} from '../recipeGeneratorConstants';



export type { LlmCompletionKind };

export { getGenerationConfigForKind };



const IM_END = '<|' + 'im_end' + '|>';



const CHAT_TEMPLATE_LEAK_MARKERS = [

  '<|im_start|>user',

  '<|im_start|>system',

  '<|im_start|>assistant',

  '<|im_start|>',

  IM_END,

] as const;



export type GuardedLlmClient = {

  configure: (config: { generationConfig?: GenerationConfig }) => void;

  generate: (messages: Message[]) => Promise<string>;

  interrupt: () => void;

  isGenerating: boolean;

  response: string;

  getGeneratedTokenCount: () => number;

};



export function normalizeLlmOutput(response: unknown): string {

  if (typeof response === 'string') {

    return response;

  }

  if (response == null) {

    return '';

  }

  try {

    return JSON.stringify(response, null, 2);

  } catch {

    return String(response);

  }

}



export function sanitizeLlmCompletion(raw: string): string {

  const text = raw.trim();

  if (!text) {

    return '';

  }



  const lower = text.toLowerCase();

  let cutIndex = text.length;



  for (const marker of CHAT_TEMPLATE_LEAK_MARKERS) {

    if (!marker) {

      continue;

    }

    const idx = lower.indexOf(marker);

    if (idx !== -1 && idx < cutIndex) {

      cutIndex = idx;

    }

  }



  return text.slice(0, cutIndex).trim();

}



export function detectChatTemplateLeak(raw: string): boolean {

  const lower = raw.toLowerCase();

  return CHAT_TEMPLATE_LEAK_MARKERS.some(marker => lower.includes(marker));

}



export async function boundedLlmGenerate(

  llm: GuardedLlmClient,

  messages: Message[],

  kind: LlmCompletionKind,

): Promise<{ text: string; interrupted: boolean; tokenCount: number }> {

  const maxTokens = LLM_MAX_TOKENS_BY_KIND[kind];

  let interrupted = false;



  const watcher = setInterval(() => {

    if (!llm.isGenerating) {

      return;

    }



    const tokenCount = llm.getGeneratedTokenCount();

    const leaked = detectChatTemplateLeak(llm.response);

    if (tokenCount >= maxTokens || leaked) {

      interrupted = true;

      llm.interrupt();

    }

  }, 80);



  try {

    llm.configure({ generationConfig: getGenerationConfigForKind(kind) });

    const raw = await llm.generate(messages);

    const fromPromise = sanitizeLlmCompletion(normalizeLlmOutput(raw));

    const fromStream = sanitizeLlmCompletion(llm.response);

    const text = fromPromise || fromStream;

    return {

      text,

      interrupted,

      tokenCount: llm.getGeneratedTokenCount(),

    };

  } catch (error) {

    const fallback = sanitizeLlmCompletion(llm.response);

    if (fallback) {

      return {

        text: fallback,

        interrupted: true,

        tokenCount: llm.getGeneratedTokenCount(),

      };

    }

    throw error;

  } finally {

    clearInterval(watcher);

  }

}

