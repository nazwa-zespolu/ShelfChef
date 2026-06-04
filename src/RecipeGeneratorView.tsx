import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {colors} from './theme/colors';
import {ProductRepository} from './infrastructure/ProductRepository';
import {InventoryItem} from './domain/types';
import {useLLM} from 'react-native-executorch';
import {
  DIET_OPTIONS,
  DietPreference,
  MEAL_OPTIONS,
  MealType,
  RECIPE_MODEL_OPTIONS,
  RecipeModelId,
  buildRecipeMessages,
  getRecipeModelConfig,
} from './recipeGeneratorModels';
import {
  RecipeModelDownloadState,
  deleteRecipeModel,
  listRecipeModelDownloadState,
} from './recipeModelStorage';

type RecipeGeneratorViewProps = {
  onRequestClose?: () => void;
};

type GeneratorScreen = 'booting' | 'consent' | 'declined' | 'modelPicker' | 'session';

function uniqByName(items: InventoryItem[], max = 80): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const name = (it.name ?? '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= max) break;
  }
  return out;
}

function normalizeLlmOutput(response: unknown): string {
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

function dishEntryToLabel(entry: unknown): string {
  if (typeof entry === 'string') {
    return entry.trim();
  }
  if (typeof entry === 'number' && Number.isFinite(entry)) {
    return String(entry).trim();
  }
  if (entry && typeof entry === 'object') {
    const o = entry as Record<string, unknown>;
    for (const key of ['name', 'title', 'dish', 'recipe', 'nazwa', 'label']) {
      const v = o[key];
      if (typeof v === 'string' && v.trim()) {
        return v.trim();
      }
    }
  }
  return '';
}

function extractJsonCandidate(raw: string): string {
  const text = (raw ?? '').trim();
  if (!text) return '';

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const startObj = text.indexOf('{');
  const endObj = text.lastIndexOf('}');
  if (startObj !== -1 && endObj > startObj) {
    return text.slice(startObj, endObj + 1).trim();
  }

  const startArr = text.indexOf('[');
  const endArr = text.lastIndexOf(']');
  if (startArr !== -1 && endArr > startArr) {
    return text.slice(startArr, endArr + 1).trim();
  }

  return text;
}

function parseDishes(raw: string): string[] {
  const text = (raw ?? '').trim();
  if (!text) return [];

  const candidates = [text, extractJsonCandidate(text)];
  for (const chunk of candidates) {
    if (!chunk) continue;
    try {
      const json = JSON.parse(chunk) as unknown;
      if (Array.isArray(json)) {
        return json.map(dishEntryToLabel).filter(Boolean);
      }
      if (
        json &&
        typeof json === 'object' &&
        'dishes' in (json as Record<string, unknown>) &&
        Array.isArray((json as {dishes?: unknown}).dishes)
      ) {
        return (json as {dishes: unknown[]}).dishes.map(dishEntryToLabel).filter(Boolean);
      }
    } catch {
      // try next candidate / fall through
    }
  }

  return text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => l.replace(/^[-*•]\s*/, ''))
    .map(l => l.replace(/^\d+[.)]\s*/, ''))
    .map(l => l.replace(/^"+|"+$/g, '').trim())
    .filter(Boolean);
}

const repo = new ProductRepository();

function SelectionGroup<T extends string>({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: {id: T; label: string}[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <View style={styles.chipRow}>
        {options.map(option => {
          const selected = option.id === value;
          return (
            <Pressable
              key={option.id}
              onPress={() => onChange(option.id)}
              style={({pressed}) => [
                styles.chip,
                selected && styles.chipSelected,
                pressed && styles.chipPressed,
              ]}>
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function RecipeGeneratorView({onRequestClose}: RecipeGeneratorViewProps) {
  const insets = useSafeAreaInsets();
  const [booting, setBooting] = useState(true);
  const [screen, setScreen] = useState<GeneratorScreen>('consent');
  const [activeModelId, setActiveModelId] = useState<RecipeModelId | null>(null);
  const [downloadState, setDownloadState] = useState<RecipeModelDownloadState | null>(null);
  const [storageBusy, setStorageBusy] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  const refreshDownloadState = useCallback(async () => {
    const state = await listRecipeModelDownloadState();
    setDownloadState(state);
    return state;
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        if (await repo.getRecipeModelDeclined()) {
          setScreen('declined');
          return;
        }
        if (!(await repo.getRecipeModelConsent())) {
          setScreen('consent');
          return;
        }
        setScreen('modelPicker');
        await refreshDownloadState();
      } catch {
        setScreen('consent');
      } finally {
        setBooting(false);
      }
    };
    bootstrap().catch(() => {
      setScreen('consent');
      setBooting(false);
    });
  }, [refreshDownloadState]);

  const acceptConsent = useCallback(() => {
    repo.setRecipeModelConsent(true).catch(() => {});
    repo.setRecipeModelDeclined(false).catch(() => {});
    setScreen('modelPicker');
    refreshDownloadState().catch(() => {});
  }, [refreshDownloadState]);

  const declineFlow = useCallback(() => {
    repo.setRecipeModelDeclined(true).catch(() => {});
    repo.setRecipeModelConsent(false).catch(() => {});
    repo.setRecipeModelChoice(null).catch(() => {});
    setActiveModelId(null);
    setScreen('declined');
  }, []);

  const startSession = useCallback((modelId: RecipeModelId) => {
    repo.setRecipeModelChoice(modelId).catch(() => {});
    setActiveModelId(modelId);
    setScreen('session');
  }, []);

  const endSession = useCallback(() => {
    setActiveModelId(null);
    setScreen('modelPicker');
    refreshDownloadState().catch(() => {});
  }, [refreshDownloadState]);

  const handleDeleteModel = useCallback(
    async (modelId: RecipeModelId) => {
      setStorageError(null);
      setStorageBusy(true);
      try {
        await deleteRecipeModel(modelId);
        if (activeModelId === modelId) {
          setActiveModelId(null);
          setScreen('modelPicker');
        }
        await refreshDownloadState();
      } catch {
        setStorageError('Nie udało się usunąć modelu z urządzenia.');
      } finally {
        setStorageBusy(false);
      }
    },
    [activeModelId, refreshDownloadState],
  );

  return (
    <View style={[styles.root, {paddingTop: insets.top + 8}]}>
      {booting ? (
        <View style={styles.body}>
          <Text style={styles.title}>Generator przepisów</Text>
          <View style={styles.row}>
            <ActivityIndicator color={colors.success} />
            <Text style={styles.cardLine}>Sprawdzam ustawienia…</Text>
          </View>
        </View>
      ) : null}

      {!booting && screen === 'consent' ? (
        <View style={styles.body}>
          <Text style={styles.title}>Generator przepisów</Text>
          <Text style={styles.hint}>
            Generator działa offline na urządzeniu. Po zgodzie wybierzesz model AI do pobrania (od ok. 1 GB do ok.
            3 GB). Pobieranie może zająć kilka minut i zużyć transfer danych.
          </Text>
          <View style={styles.ctaRow}>
            <Pressable
              onPress={acceptConsent}
              style={({pressed}) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}>
              <Text style={styles.primaryButtonText}>Zgadzam się — wybierz model</Text>
            </Pressable>
            <Pressable
              onPress={declineFlow}
              style={({pressed}) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}>
              <Text style={styles.secondaryButtonText}>Nie teraz</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {!booting && screen === 'declined' ? (
        <View style={styles.body}>
          <Text style={styles.title}>Generator przepisów</Text>
          <Text style={styles.hint}>
            Aby korzystać z generatora, wyraź zgodę na pobranie modelu AI i wybierz model dopasowany do telefonu.
          </Text>
          <View style={styles.ctaRow}>
            <Pressable
              onPress={acceptConsent}
              style={({pressed}) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}>
              <Text style={styles.primaryButtonText}>Wróć do zgody</Text>
            </Pressable>
            <Pressable
              onPress={declineFlow}
              style={({pressed}) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}>
              <Text style={styles.secondaryButtonText}>Nie teraz</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {!booting && screen === 'modelPicker' ? (
        <ScrollView style={styles.body} contentContainerStyle={styles.pickerContent}>
          <Text style={styles.title}>Wybierz model AI</Text>
          <Text style={styles.hint}>
            Dotknij modelu, aby go pobrać (jeśli trzeba), załadować i przejść do ustawień diety. Pobrane modele możesz
            usunąć, żeby zwolnić miejsce.
          </Text>

          {RECIPE_MODEL_OPTIONS.map(option => {
            const downloaded = downloadState?.[option.id] ?? false;
            return (
              <Pressable
                key={option.id}
                onPress={() => startSession(option.id)}
                disabled={storageBusy}
                style={({pressed}) => [
                  styles.modelOption,
                  pressed && styles.modelOptionPressed,
                  storageBusy && styles.modelOptionDisabled,
                ]}>
                <View style={styles.modelOptionHeader}>
                  <Text style={styles.modelOptionTitle}>{option.title}</Text>
                  <Text style={[styles.badge, downloaded ? styles.badgeOk : styles.badgeMuted]}>
                    {downloaded ? 'Pobrany' : 'Nie pobrany'}
                  </Text>
                </View>
                <Text style={styles.modelOptionSubtitle}>
                  {option.subtitle} · {option.sizeHint}
                </Text>
              </Pressable>
            );
          })}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Pobrane modele</Text>
            {downloadState == null ? (
              <View style={styles.row}>
                <ActivityIndicator color={colors.success} />
                <Text style={styles.cardLine}>Sprawdzam pamięć…</Text>
              </View>
            ) : RECIPE_MODEL_OPTIONS.every(o => !downloadState[o.id]) ? (
              <Text style={styles.cardLine}>Brak pobranych modeli na urządzeniu.</Text>
            ) : (
              RECIPE_MODEL_OPTIONS.filter(o => downloadState[o.id]).map(option => (
                <View key={option.id} style={styles.downloadedRow}>
                  <Text style={styles.downloadedName}>{option.title}</Text>
                  <Pressable
                    onPress={() => handleDeleteModel(option.id).catch(() => {})}
                    disabled={storageBusy}
                    style={({pressed}) => [
                      styles.dangerChip,
                      pressed && styles.dangerChipPressed,
                      storageBusy && styles.dangerChipDisabled,
                    ]}>
                    <Text style={styles.dangerChipText}>Usuń</Text>
                  </Pressable>
                </View>
              ))
            )}
            <Pressable
              style={styles.smallButton}
              disabled={storageBusy}
              onPress={() => refreshDownloadState().catch(() => {})}>
              <Text style={styles.smallButtonText}>Odśwież listę</Text>
            </Pressable>
          </View>

          {storageError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorTitle}>Pamięć</Text>
              <Text style={styles.errorText}>{storageError}</Text>
            </View>
          ) : null}

          <View style={styles.ctaRow}>
            <Pressable
              onPress={declineFlow}
              style={({pressed}) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}>
              <Text style={styles.secondaryButtonText}>Wyjdź</Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : null}

      {!booting && screen === 'session' && activeModelId ? (
        <RecipeGeneratorSession
          modelId={activeModelId}
          onRequestClose={onRequestClose}
          onBack={endSession}
        />
      ) : null}
    </View>
  );
}

function RecipeGeneratorSession({
  modelId,
  onRequestClose,
  onBack,
}: {
  modelId: RecipeModelId;
  onRequestClose?: () => void;
  onBack: () => void;
}) {
  const modelOption = RECIPE_MODEL_OPTIONS.find(o => o.id === modelId);
  const llm = useLLM({model: getRecipeModelConfig(modelId)});

  const [diet, setDiet] = useState<DietPreference>('none');
  const [mealType, setMealType] = useState<MealType>('lunch');
  const [dishNames, setDishNames] = useState<string[]>([]);
  const [rawLlmOutput, setRawLlmOutput] = useState<string | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[] | null>(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [remountKey, setRemountKey] = useState(0);

  const pendingCloseRef = useRef(false);
  const generationConfiguredRef = useRef(false);

  const modelPhase = llm.isReady ? 'preferences' : 'loading';
  const canClose = !llm.isGenerating;

  const requestClose = useCallback(() => {
    if (!onRequestClose) {
      return;
    }
    if (llm.isGenerating) {
      pendingCloseRef.current = true;
      llm.interrupt();
      return;
    }
    onRequestClose();
  }, [llm, onRequestClose]);

  useEffect(() => {
    if (!onRequestClose) {
      return;
    }
    if (!llm.isGenerating && pendingCloseRef.current) {
      pendingCloseRef.current = false;
      onRequestClose();
    }
  }, [llm.isGenerating, onRequestClose]);

  useEffect(() => {
    if (!llm.isReady) {
      generationConfiguredRef.current = false;
      return;
    }
    if (llm.error) {
      return;
    }
    if (generationConfiguredRef.current) {
      return;
    }
    generationConfiguredRef.current = true;
    llm.configure({
      generationConfig: {
        outputTokenBatchSize: 32,
        batchTimeInterval: 500,
        temperature: 0.35,
        topP: 0.9,
      },
    });
  }, [llm.isReady, llm.error]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadInventory = useCallback(async () => {
    setInventoryLoading(true);
    try {
      const all = await repo.getFullInventory();
      setInventory(all);
    } finally {
      setInventoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (modelPhase === 'preferences') {
      loadInventory().catch(() => {});
    }
  }, [modelPhase, loadInventory]);

  const ingredients = useMemo(() => (inventory ? uniqByName(inventory, 60) : []), [inventory]);

  const generate = useCallback(async () => {
    setGenerateError(null);
    setDishNames([]);
    setRawLlmOutput(null);

    if (!llm.isReady) {
      setGenerateError('Model jeszcze się ładuje.');
      return;
    }
    if (!inventory) {
      setGenerateError('Nie udało się wczytać zapasów.');
      return;
    }
    if (ingredients.length === 0) {
      setGenerateError('Spiżarnia jest pusta — dodaj produkty, a potem spróbuj ponownie.');
      return;
    }

    try {
      const response = await llm.generate(buildRecipeMessages(modelId, ingredients, diet, mealType));
      const rawText = normalizeLlmOutput(response);
      setRawLlmOutput(rawText);

      const parsed = parseDishes(rawText);
      if (parsed.length === 0) {
        setGenerateError(
          'Nie udało się wyciągnąć listy dań z odpowiedzi — zobacz sekcję „Surowa odpowiedź modelu”.',
        );
        return;
      }
      setDishNames(parsed.slice(0, 30));
    } catch {
      setGenerateError('Generowanie nie powiodło się.');
    }
  }, [diet, ingredients, inventory, llm, mealType, modelId]);

  const retryModel = useCallback(() => {
    setDishNames([]);
    setRawLlmOutput(null);
    setGenerateError(null);
    setRemountKey(k => k + 1);
  }, []);

  const progressPct = Math.round((llm.downloadProgress ?? 0) * 100);

  if (modelPhase === 'loading') {
    return (
      <View style={styles.body} key={remountKey}>
        <View style={styles.sectionHeader}>
          <Text style={styles.title}>Ładowanie modelu</Text>
          <Pressable onPress={onBack} style={({pressed}) => [styles.closeChip, pressed && styles.closeChipPressed]}>
            <Text style={styles.closeChipText}>Anuluj</Text>
          </Pressable>
        </View>
        <View style={styles.card}>
          {modelOption ? (
            <Text style={styles.cardLine}>
              {modelOption.title} · {modelOption.sizeHint}
            </Text>
          ) : null}
          <View style={styles.row}>
            <ActivityIndicator color={colors.success} />
            <View style={styles.rowTextCol}>
              <Text style={styles.cardLine}>
                {progressPct > 0 && progressPct < 100 ? 'Pobieranie modelu…' : 'Ładowanie modelu…'}
              </Text>
              <Text style={styles.cardHint}>{progressPct}%</Text>
            </View>
          </View>
        </View>
        {llm.error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Błąd modelu</Text>
            <Text style={styles.errorText}>{String((llm.error as {message?: string})?.message ?? llm.error)}</Text>
            <Pressable style={styles.smallButton} onPress={retryModel}>
              <Text style={styles.smallButtonText}>Spróbuj ponownie</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.body} key={remountKey}>
      <View style={styles.sectionHeader}>
        <Text style={styles.title}>Ustawienia przepisu</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={onBack} style={({pressed}) => [styles.closeChip, pressed && styles.closeChipPressed]}>
            <Text style={styles.closeChipText}>Modele</Text>
          </Pressable>
          {onRequestClose ? (
            <Pressable
              onPress={requestClose}
              disabled={!canClose}
              style={({pressed}) => [
                styles.closeChip,
                pressed && styles.closeChipPressed,
                !canClose && styles.closeChipDisabled,
              ]}>
              <Text style={styles.closeChipText}>{canClose ? 'Zamknij' : '…'}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {modelOption ? (
        <Text style={styles.hint}>
          Model: {modelOption.title}. Spiżarnia: {inventoryLoading ? '…' : ingredients.length} składników.
        </Text>
      ) : null}

      <ScrollView style={styles.preferencesScroll} contentContainerStyle={styles.preferencesContent}>
        <SelectionGroup title="Dieta" options={DIET_OPTIONS} value={diet} onChange={setDiet} />
        <SelectionGroup title="Typ dania" options={MEAL_OPTIONS} value={mealType} onChange={setMealType} />

        <View style={styles.actionsRow}>
          <Pressable
            onPress={() => generate().catch(() => {})}
            disabled={llm.isGenerating || inventoryLoading}
            style={({pressed}) => [
              styles.primaryButton,
              pressed && !llm.isGenerating && styles.primaryButtonPressed,
              (llm.isGenerating || inventoryLoading) && styles.primaryButtonDisabled,
            ]}>
            <Text style={styles.primaryButtonText}>{llm.isGenerating ? 'Generuję…' : 'Generuj propozycje'}</Text>
          </Pressable>

          <Pressable
            onPress={() => llm.interrupt()}
            disabled={!llm.isGenerating}
            style={({pressed}) => [
              styles.secondaryButton,
              pressed && styles.secondaryButtonPressed,
              !llm.isGenerating && styles.secondaryButtonDisabled,
            ]}>
            <Text style={styles.secondaryButtonText}>Stop</Text>
          </Pressable>
        </View>

        {generateError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Nie udało się</Text>
            <Text style={styles.errorText}>{generateError}</Text>
          </View>
        ) : null}

        {llm.isGenerating ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Generowanie (na żywo)</Text>
            <View style={styles.streamingStatusRow}>
              <ActivityIndicator color={colors.success} />
              <Text style={styles.streamingText}>Model pisze odpowiedź…</Text>
            </View>
            <ScrollView style={styles.rawScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              <Text selectable style={styles.rawText}>
                {llm.response || '…'}
              </Text>
            </ScrollView>
          </View>
        ) : null}

        {rawLlmOutput !== null ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Surowa odpowiedź modelu</Text>
            <ScrollView style={styles.rawScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              <Text selectable style={styles.rawText}>
                {rawLlmOutput}
              </Text>
            </ScrollView>
          </View>
        ) : null}

        <Text style={styles.listTitle}>Propozycje dań</Text>
        {dishNames.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyHint}>Ustaw dietę i typ dania, potem kliknij „Generuj propozycje”.</Text>
          </View>
        ) : (
          dishNames.map((item, idx) => (
            <View key={`${idx}-${item}`} style={styles.dishRow}>
              <Text style={styles.dishName}>{item}</Text>
            </View>
          ))
        )}
      </ScrollView>
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
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
    marginBottom: 12,
  },
  ctaRow: {
    marginTop: 18,
    gap: 10,
  },
  pickerContent: {
    paddingBottom: 32,
  },
  preferencesScroll: {
    flex: 1,
  },
  preferencesContent: {
    paddingBottom: 32,
  },
  modelOption: {
    marginTop: 12,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modelOptionPressed: {
    opacity: 0.92,
  },
  modelOptionDisabled: {
    opacity: 0.55,
  },
  modelOptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  modelOptionTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  modelOptionSubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  badge: {
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  badgeOk: {
    color: colors.successText,
    backgroundColor: colors.success,
  },
  badgeMuted: {
    color: colors.textMuted,
    backgroundColor: colors.surfaceMuted,
  },
  downloadedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  downloadedName: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  dangerChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.danger,
  },
  dangerChipPressed: {
    opacity: 0.9,
  },
  dangerChipDisabled: {
    opacity: 0.5,
  },
  dangerChipText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 12,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
  },
  chipSelected: {
    borderColor: colors.success,
    backgroundColor: colors.success,
  },
  chipPressed: {
    opacity: 0.9,
  },
  chipText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  chipTextSelected: {
    color: colors.successText,
  },
  actionsRow: {
    marginTop: 6,
    gap: 10,
    marginBottom: 10,
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
  secondaryButtonDisabled: {
    opacity: 0.5,
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 15,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },
  cardTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 8,
  },
  cardLine: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  cardHint: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowTextCol: {
    flex: 1,
  },
  errorBox: {
    marginTop: 10,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  errorTitle: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 4,
  },
  errorText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  smallButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.success,
  },
  smallButtonText: {
    color: colors.successText,
    fontWeight: '800',
    fontSize: 13,
  },
  streamingStatusRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 10,
  },
  streamingText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  rawScroll: {
    maxHeight: 260,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    padding: 10,
  },
  rawText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 18,
  },
  listTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  emptyBox: {
    padding: 18,
    alignItems: 'center',
  },
  emptyHint: {
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  dishRow: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },
  dishName: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
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
