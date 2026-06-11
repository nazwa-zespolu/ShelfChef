import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from './theme/colors';
import { ProductRepository } from './infrastructure/ProductRepository';
import {
  QWEN2_5_3B_QUANTIZED,
  Message,
  useLLM,
} from 'react-native-executorch';
import { BareResourceFetcher } from 'react-native-executorch-bare-resource-fetcher';
import { LazyDietaryCategorizationService } from './features/recipe-generator/application/lazyDietaryCategorizationService';
import { RecipeGenerationService } from './features/recipe-generator/application/recipeGenerationService';
import { RecipeGenerationPipeline } from './features/recipe-generator/application/recipeGenerationPipeline';
import {
  CategorizationProgress,
  DietPreference,
  dietRequiresCategorization,
  DishType,
  RecipeGenerationError,
  RecipeGenerationProgressStage,
} from './features/recipe-generator/domain/recipeGenerationTypes';
import { RecipePreferencesScreen } from './features/recipe-generator/ui/RecipePreferencesScreen';
import { RecipeGenerationProgressScreen } from './features/recipe-generator/ui/RecipeGenerationProgressScreen';
import { RecipeResultsScreen } from './features/recipe-generator/ui/RecipeResultsScreen';

import {
  categorizationBatchSize,
  maxDishes,
} from './features/recipe-generator/recipeGeneratorConstants';

type RecipeGeneratorViewProps = {
  onRequestClose?: () => void;
};

type ConsentState = 'unknown' | 'accepted' | 'declined';
type FlowScreen = 'preferences' | 'progress' | 'results';

import { LlmCompletionKind } from './features/recipe-generator/recipeGeneratorConstants';
import { boundedLlmGenerate } from './features/recipe-generator/infrastructure/llmCompletionGuard';
import {
  cancelStaleRecipeModelDownloads,
  isStaleModelDownloadError,
} from './features/recipe-generator/infrastructure/recipeModelDownloadLifecycle';

const repo = new ProductRepository();

export default function RecipeGeneratorView({ onRequestClose }: RecipeGeneratorViewProps) {
  const insets = useSafeAreaInsets();
  const [consent, setConsent] = useState<ConsentState>('unknown');
  const [consentBooting, setConsentBooting] = useState(true);

  const checkModelDownloaded = useCallback(async () => {
    try {
      const downloaded = await BareResourceFetcher.listDownloadedModels();
      const modelFileName = QWEN2_5_3B_QUANTIZED.modelSource.split('/').pop()?.toLowerCase();
      if (!modelFileName) {
        return false;
      }
      return downloaded.some(path => path.toLowerCase().includes(modelFileName));
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    const bootstrapConsent = async () => {
      try {
        const savedConsent = await repo.getRecipeModelConsentState();
        if (savedConsent === 'accepted') {
          setConsent('accepted');
          return;
        }
        if (savedConsent === 'declined') {
          setConsent('declined');
          return;
        }
        const hasModel = await checkModelDownloaded();
        if (hasModel) {
          await repo.setRecipeModelConsent(true);
          setConsent('accepted');
          return;
        }
        setConsent('unknown');
      } finally {
        setConsentBooting(false);
      }
    };
    bootstrapConsent().catch(() => {
      setConsent('unknown');
      setConsentBooting(false);
    });
  }, [checkModelDownloaded]);

  const acceptConsent = useCallback(() => {
    repo.setRecipeModelConsent(true).catch(() => {});
    setConsent('accepted');
  }, []);

  const declineConsent = useCallback(() => {
    repo.setRecipeModelConsent(false).catch(() => {});
    setConsent('declined');
  }, []);

  return (
    <View style={[styles.root, {paddingTop: insets.top + 8}]}>

      {consentBooting ? (
        <View style={styles.body}>
          <Text style={styles.title}>Generator przepisów</Text>
          <View style={styles.row}>
            <ActivityIndicator color={colors.success} />
            <Text style={styles.cardLine}>Sprawdzam zapisane ustawienia i model…</Text>
          </View>
        </View>
      ) : null}

      {!consentBooting && consent === 'unknown' ? (
        <View style={styles.body}>
          <Text style={styles.title}>Generator przepisów</Text>
          <Text style={styles.hint}>
            Ten generator działa offline na urządzeniu, ale wymaga jednorazowego pobrania modelu AI. Pobieranie może
            zająć kilka minut i zużyć transfer.
          </Text>

          <View style={styles.ctaRow}>
            <Pressable
              onPress={acceptConsent}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}>
              <Text style={styles.primaryButtonText}>Pobierz i uruchom</Text>
            </Pressable>
            <Pressable
              onPress={declineConsent}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}>
              <Text style={styles.secondaryButtonText}>Nie, dziękuję</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {!consentBooting && consent === 'declined' ? (
        <View style={styles.body}>
          <Text style={styles.title}>Generator przepisów</Text>
          <Text style={styles.hint}>
            Aby korzystać z generatora, potrzebujesz zgody na pobranie modelu AI na urządzenie (3GB).
          </Text>
          <View style={styles.ctaRow}>
            <Pressable
              onPress={acceptConsent}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}>
              <Text style={styles.primaryButtonText}>Zgadzam się</Text>
            </Pressable>
            <Pressable
              onPress={declineConsent}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}>
              <Text style={styles.secondaryButtonText}>Nie teraz</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {!consentBooting && consent === 'accepted' ? (
        <RecipeGeneratorFlow onRequestClose={onRequestClose} />
      ) : null}
    </View>
  );
}

function RecipeGeneratorFlow({ onRequestClose }: { onRequestClose?: () => void }) {
  const [modelLoadEnabled, setModelLoadEnabled] = useState(false);
  const llm = useLLM({model: QWEN2_5_3B_QUANTIZED, preventLoad: !modelLoadEnabled});
  const [screen, setScreen] = useState<FlowScreen>('preferences');
  const [dishType, setDishType] = useState<DishType>('dinner');
  const [diet, setDiet] = useState<DietPreference>('none');
  const [skipCategorization, setSkipCategorization] = useState(true);
  const [dishes, setDishes] = useState<string[]>([]);
  const [progressStage, setProgressStage] =
    useState<RecipeGenerationProgressStage>('categorizing');
  const [categorizationProgress, setCategorizationProgress] =
    useState<CategorizationProgress | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [isRunningPipeline, setIsRunningPipeline] = useState(false);

  const pendingCloseRef = useRef(false);
  const downloadRecoveryAttemptedRef = useRef(false);

  useEffect(() => {
    let active = true;
    (async () => {
      await cancelStaleRecipeModelDownloads();
      if (active) {
        setModelLoadEnabled(true);
      }
    })();
    return () => {
      active = false;
      setModelLoadEnabled(false);
      cancelStaleRecipeModelDownloads().catch(() => {});
    };
  }, []);

  const restartModelLoad = useCallback(() => {
    setGenerateError(null);
    setModelLoadEnabled(false);
    cancelStaleRecipeModelDownloads()
      .catch(() => {})
      .finally(() => setModelLoadEnabled(true));
  }, []);

  useEffect(() => {
    if (!llm.error || !isStaleModelDownloadError(llm.error)) {
      downloadRecoveryAttemptedRef.current = false;
      return;
    }
    if (downloadRecoveryAttemptedRef.current) {
      return;
    }
    downloadRecoveryAttemptedRef.current = true;
    restartModelLoad();
  }, [llm.error, restartModelLoad]);

  const modelClient = useMemo(
    () => ({
      complete: async (
        systemPrompt: string,
        userPrompt: string,
        kind: LlmCompletionKind,
      ): Promise<string> => {
        const { text, interrupted, tokenCount } = await boundedLlmGenerate(
          llm,
          [
            { role: 'system', content: systemPrompt } as Message,
            { role: 'user', content: userPrompt } as Message,
          ],
          kind,
        );
        if (__DEV__ && interrupted) {
          console.log('[RecipeDebug] llm interrupted', kind, { tokenCount });
        }
        return text;
      },
    }),
    [llm],
  );

  const lazyDietaryCategorizationService = useMemo(
    () =>
      new LazyDietaryCategorizationService({
        modelClient,
        maxParseRetries: 2,
      }),
    [modelClient],
  );

  const recipeGenerationService = useMemo(
    () =>
      new RecipeGenerationService({
        modelClient,
        maxParseRetries: 2,
      }),
    [modelClient],
  );

  const pipeline = useMemo(
    () =>
      new RecipeGenerationPipeline({
        repository: repo,
        lazyDietaryCategorizationService,
        recipeGenerationService,
        
      }),
    [lazyDietaryCategorizationService, recipeGenerationService],
  );

  const canClose = !isRunningPipeline && !llm.isGenerating;
  const requestClose = useCallback(() => {
    if (!onRequestClose) {
      return;
    }
    if (!canClose) {
      pendingCloseRef.current = true;
      llm.interrupt();
      return;
    }
    onRequestClose();
  }, [canClose, llm, onRequestClose]);

  useEffect(() => {
    if (!onRequestClose) {
      return;
    }
    if (canClose && pendingCloseRef.current) {
      pendingCloseRef.current = false;
      onRequestClose();
    }
  }, [canClose, onRequestClose]);

  const generate = useCallback(async () => {
    setGenerateError(null);
    setIsRunningPipeline(true);
    setScreen('progress');
    setProgressStage('categorizing');
    setCategorizationProgress(null);

    if (!llm.isReady) {
      setGenerateError('Model jeszcze się ładuje.');
      setIsRunningPipeline(false);
      return;
    }



    try {
      const result = await pipeline.run(
        {
          dishType,
          diet,
          maxDishes: maxDishes,
          categorizationBatchSize: categorizationBatchSize,
          skipCategorization,
        },
        event => {
          setProgressStage(event.stage);
          if (event.categorization) {
            setCategorizationProgress(event.categorization);
          } else if (event.stage !== 'categorizing') {
            setCategorizationProgress(null);
          }
        },
      );
      setDishes(result.dishes);
      setScreen('results');
    } catch (error) {
      if (error instanceof RecipeGenerationError) {
        if (error.code === 'EMPTY_PANTRY') {
          setGenerateError('Spiżarnia jest pusta. Dodaj produkty i spróbuj ponownie.');
        } else if (error.code === 'INVALID_JSON_RESPONSE') {
          setGenerateError('Model zwrócił niepoprawny JSON po retry. Spróbuj ponownie.');
        } else {
          setGenerateError('Wystąpił błąd modelu podczas generowania.');
        }
      } else {
        setGenerateError('Generowanie nie powiodło się.');
      }
      setScreen('progress');
    } finally {
      setIsRunningPipeline(false);
    }
  }, [diet, dishType, llm.isReady, pipeline, skipCategorization]);

  useEffect(() => {
    if (!__DEV__) {
      return;
    }

    (globalThis as any).__SHELFCHEF_DEBUG__ = {
      resetDietaryCategorization: async () => {
        const changed = await repo.resetAllDietaryCategorization();
        console.log('[ShelfChefDebug] resetDietaryCategorization changed:', changed);
        return changed;
      },
      getDbSnapshot: async (limit = 200) => {
        const snapshot = await repo.getDebugSnapshot(limit);
        console.log('[ShelfChefDebug] getDbSnapshot', snapshot);
        return snapshot;
      },
    };
  }, []);

  const retryModel = useCallback(() => {
    restartModelLoad();
  }, [restartModelLoad]);

  const progressPct = Math.round((llm.downloadProgress ?? 0) * 100);
  const llmError = llm.error ? String((llm.error as { message?: string })?.message ?? llm.error) : null;

  return (
    <View style={styles.body}>
      <View style={styles.sectionHeader}>
        <Text style={styles.title}>Generator przepisów</Text>
        {onRequestClose ? (
          <Pressable
            onPress={requestClose}
            disabled={!canClose}
            style={({pressed}) => [
              styles.closeChip,
              pressed && styles.closeChipPressed,
              !canClose && styles.closeChipDisabled,
            ]}>
            <Text style={styles.closeChipText}>{canClose ? 'Zamknij' : 'Zatrzymuję…'}</Text>
          </Pressable>
        ) : null}
      </View>

      {screen === 'results' ? (
        <RecipeResultsScreen
          dishes={dishes}
          onGenerateAgain={() => {
            generate().catch(() => {});
          }}
          onBackToPreferences={() => setScreen('preferences')}
        />
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          style={styles.flowBody}
          contentContainerStyle={styles.flowBodyContent}>
          {screen === 'preferences' ? (
            <RecipePreferencesScreen
              dishType={dishType}
              diet={diet}
              skipCategorization={skipCategorization}
              isModelReady={llm.isReady}
              downloadProgress={progressPct}
              modelError={llmError}
              onDishTypeChange={setDishType}
              onDietChange={value => {
                setDiet(value);
                setSkipCategorization(!dietRequiresCategorization(value));
              }}
              onSkipCategorizationChange={setSkipCategorization}
              onStart={() => {
                generate().catch(() => {});
              }}
              onRetryModel={retryModel}
            />
          ) : null}

          {screen === 'progress' ? (
            <RecipeGenerationProgressScreen
              stage={progressStage}
              categorizationProgress={categorizationProgress}
              error={generateError}
              isGenerating={isRunningPipeline || llm.isGenerating}
              onCancel={() => llm.interrupt()}
              onRetry={() => {
                generate().catch(() => {});
              }}
              onBack={() => setScreen('preferences')}
            />
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  body: {
    flex: 1,
    padding: 20,
  },
  flowBody: {
    flex: 1,
  },
  flowBodyContent: {
    paddingBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
  },
  hint: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  ctaRow: {
    marginTop: 18,
    gap: 10,
  },
  primaryButton: {
    backgroundColor: colors.success,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonPressed: {
    opacity: 0.9,
  },
  primaryButtonDisabled: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: colors.successText,
    fontWeight: '800',
    fontSize: 15,
  },
  secondaryButton: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryButtonPressed: {
    opacity: 0.9,
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 15,
  },
  cardLine: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  closeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  closeChipPressed: {
    opacity: 0.9,
  },
  closeChipDisabled: {
    opacity: 0.6,
  },
  closeChipText: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 12,
  },
});
