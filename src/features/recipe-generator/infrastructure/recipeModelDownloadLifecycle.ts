import { QWEN2_5_3B_QUANTIZED } from 'react-native-executorch';
import { BareResourceFetcher } from 'react-native-executorch-bare-resource-fetcher';

const RECIPE_MODEL_SOURCES = [
  QWEN2_5_3B_QUANTIZED.modelSource,
  QWEN2_5_3B_QUANTIZED.tokenizerSource,
  QWEN2_5_3B_QUANTIZED.tokenizerConfigSource,
] as const;

export function isStaleModelDownloadError(error: unknown): boolean {
  const message = String(
    (error as { message?: string })?.message ?? error ?? '',
  ).toLowerCase();
  return message.includes('already downloading');
}

export async function cancelStaleRecipeModelDownloads(): Promise<void> {
  for (const source of RECIPE_MODEL_SOURCES) {
    try {
      await BareResourceFetcher.cancelFetching(source);
    } catch {
      // No active download for this source — expected.
    }
  }
}
