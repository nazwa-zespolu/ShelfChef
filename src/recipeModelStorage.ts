import {BareResourceFetcher} from 'react-native-executorch-bare-resource-fetcher';
import {
  RECIPE_MODEL_OPTIONS,
  RecipeModelId,
  getRecipeModelConfig,
  modelFileNameFromConfig,
} from './recipeGeneratorModels';

export type RecipeModelDownloadState = Record<RecipeModelId, boolean>;

export async function listRecipeModelDownloadState(): Promise<RecipeModelDownloadState> {
  let downloadedPaths: string[] = [];
  try {
    downloadedPaths = await BareResourceFetcher.listDownloadedModels();
  } catch {
    downloadedPaths = [];
  }

  const state = {} as RecipeModelDownloadState;
  for (const option of RECIPE_MODEL_OPTIONS) {
    const fileName = modelFileNameFromConfig(option.config);
    state[option.id] =
      !!fileName && downloadedPaths.some(path => path.toLowerCase().includes(fileName));
  }
  return state;
}

export async function isRecipeModelDownloaded(modelId: RecipeModelId): Promise<boolean> {
  const state = await listRecipeModelDownloadState();
  return state[modelId];
}

export async function deleteRecipeModel(modelId: RecipeModelId): Promise<void> {
  const config = getRecipeModelConfig(modelId);
  const downloadState = await listRecipeModelDownloadState();

  const sources = [config.modelSource];

  const otherUsesSharedTokenizer = RECIPE_MODEL_OPTIONS.some(
    option =>
      option.id !== modelId &&
      downloadState[option.id] &&
      option.config.tokenizerSource === config.tokenizerSource,
  );

  if (!otherUsesSharedTokenizer) {
    sources.push(config.tokenizerSource, config.tokenizerConfigSource);
  }

  await BareResourceFetcher.deleteResources(...sources);
}
