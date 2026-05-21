import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
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
import {QWEN2_5_3B_QUANTIZED, Message, useLLM} from 'react-native-executorch';
import {BareResourceFetcher} from 'react-native-executorch-bare-resource-fetcher';

type RecipeGeneratorViewProps = {
  onRequestClose: () => void;
};

type ConsentState = 'unknown' | 'accepted' | 'declined';

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

  // Heuristic fallback: bullet/line list
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

export default function RecipeGeneratorView({onRequestClose}: RecipeGeneratorViewProps) {
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
        const savedConsent = await repo.getRecipeModelConsent();
        if (!savedConsent) {
          setConsent('unknown');
          return;
        }
        const hasModel = await checkModelDownloaded();
        setConsent(hasModel ? 'accepted' : 'unknown');
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
    <View style={[styles.root, {paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12}]}>
      <View style={styles.header}>
        <Pressable
          onPress={onRequestClose}
          style={({pressed}) => [styles.back, pressed && styles.backPressed]}
          hitSlop={10}>
          <Text style={styles.backText}>&#8592; Wróć</Text>
        </Pressable>
      </View>

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
              style={({pressed}) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}>
              <Text style={styles.primaryButtonText}>Pobierz i uruchom</Text>
            </Pressable>
            <Pressable
              onPress={declineConsent}
              style={({pressed}) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}>
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
              style={({pressed}) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}>
              <Text style={styles.primaryButtonText}>Zgadzam się</Text>
            </Pressable>
            <Pressable
              onPress={onRequestClose}
              style={({pressed}) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}>
              <Text style={styles.secondaryButtonText}>Wróć</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {!consentBooting && consent === 'accepted' ? <RecipeGeneratorLLM onRequestClose={onRequestClose} /> : null}
    </View>
  );
}

function RecipeGeneratorLLM({onRequestClose}: {onRequestClose: () => void}) {
  const llm = useLLM({model: QWEN2_5_3B_QUANTIZED});
  const [dishNames, setDishNames] = useState<string[]>([]);
  const [rawLlmOutput, setRawLlmOutput] = useState<string | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[] | null>(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [remountKey, setRemountKey] = useState(0);

  const pendingCloseRef = useRef(false);
  const generationConfiguredRef = useRef(false);

  const canClose = !llm.isGenerating;
  const requestClose = useCallback(() => {
    if (llm.isGenerating) {
      pendingCloseRef.current = true;
      llm.interrupt();
      return;
    }
    onRequestClose();
  }, [llm, onRequestClose]);

  useEffect(() => {
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
  }, [llm.isReady, llm.error]); // eslint-disable-line react-hooks/exhaustive-deps -- llm.configure once per ready; llm identity churns during streaming

  // Load inventory once model is ready (or earlier)
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
    loadInventory().catch(() => {});
  }, [loadInventory]);

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

    const system: Message = {
      role: 'system',
      content:
        'You are a kitchen assistant. Respond ONLY with JSON in the format {"dishes":["..."]}.' +
        ' No comments, no Markdown, no extra fields. Only dish names.' +
        ' Each element of the dishes array MUST be a single string (the dish name), not an object.' +
        ' Suggest only dishes that can be made using given ingredients.',
   
    };
    // const system: Message = {
    //   role: 'system',
    //   content:
    //     'Jesteś szefem kuchni i planujesz dania na podstawie składników, które są w lodówce i spiżarni.' +
    //     'Nie wszystkie skladniki musisz wykorzytać a te których ci brakuje mozna dokupić.',
    // };

    const user: Message = {
      role: 'user',
      content:
        'My ingredients:\n' +
        ingredients.map(x => `- ${x}`).join('\n') +
        '\n\nPropose 5 dishes. If some ingredients are missing its ok. Return only JSON as instructed.',
    };

    try {
      const response = await llm.generate([system, user]);
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
  }, [ingredients, inventory, llm]);

  const retryModel = useCallback(() => {
    setDishNames([]);
    setRawLlmOutput(null);
    setGenerateError(null);
    setRemountKey(k => k + 1);
  }, []);

  const progressPct = Math.round((llm.downloadProgress ?? 0) * 100);

  return (
    <View style={styles.body} key={remountKey}>
      <View style={styles.sectionHeader}>
        <Text style={styles.title}>Generator przepisów</Text>
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
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Model AI</Text>
        {!llm.isReady ? (
          <View style={styles.row}>
            <ActivityIndicator color={colors.success} />
            <View style={styles.rowTextCol}>
              <Text style={styles.cardLine}>Pobieranie/ładowanie…</Text>
              <Text style={styles.cardHint}>{progressPct}%</Text>
            </View>
          </View>
        ) : (
          <Text style={styles.cardLine}>Gotowe do generowania.</Text>
        )}
        {llm.error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Błąd modelu</Text>
            <Text style={styles.errorText}>{String((llm.error as any)?.message ?? llm.error)}</Text>
            <Pressable style={styles.smallButton} onPress={retryModel}>
              <Text style={styles.smallButtonText}>Spróbuj ponownie</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Spiżarnia</Text>
        {inventoryLoading ? (
          <View style={styles.row}>
            <ActivityIndicator color={colors.success} />
            <Text style={styles.cardLine}>Wczytywanie zapasów…</Text>
          </View>
        ) : (
          <Text style={styles.cardLine}>Składniki: {ingredients.length}</Text>
        )}
        <Pressable style={styles.smallButton} onPress={loadInventory} disabled={inventoryLoading}>
          <Text style={styles.smallButtonText}>Odśwież zapasy</Text>
        </Pressable>
      </View>

      <View style={styles.actionsRow}>
        <Pressable
          onPress={() => {
            generate().catch(() => {});
          }}
          disabled={!llm.isReady || llm.isGenerating || inventoryLoading}
          style={({pressed}) => [
            styles.primaryButton,
            (pressed && !llm.isGenerating) && styles.primaryButtonPressed,
            (!llm.isReady || llm.isGenerating || inventoryLoading) && styles.primaryButtonDisabled,
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

        <Pressable
          onPress={() => {
            setDishNames([]);
            setRawLlmOutput(null);
            setGenerateError(null);
          }}
          style={({pressed}) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}>
          <Text style={styles.secondaryButtonText}>Wyczyść</Text>
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
            <Text style={styles.streamingText}>
              Model pisze odpowiedź… Aktualizacje są ograniczone (batching), żeby nie obciążać UI.
            </Text>
          </View>
          <ScrollView
            style={styles.rawScroll}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled">
            <Text selectable style={styles.rawText}>
              {llm.response || '…'}
            </Text>
          </ScrollView>
        </View>
      ) : null}

      {rawLlmOutput !== null ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Surowa odpowiedź modelu</Text>
          <Text style={styles.rawHint}>Pełny tekst zwrócony przez model (przed parsowaniem listy dań).</Text>
          <ScrollView
            style={styles.rawScroll}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled">
            <Text selectable style={styles.rawText}>
              {rawLlmOutput}
            </Text>
          </ScrollView>
        </View>
      ) : null}

      <Text style={styles.listTitle}>Propozycje dań (po parsowaniu)</Text>
      <FlatList
        style={styles.dishList}
        data={dishNames}
        keyExtractor={(x, idx) => `${idx}-${x}`}
        contentContainerStyle={[styles.listContent, dishNames.length === 0 && styles.listEmpty]}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>Brak propozycji</Text>
            <Text style={styles.emptyHint}>Kliknij „Generuj propozycje”, aby zobaczyć listę dań.</Text>
          </View>
        }
        renderItem={({item}) => (
          <View style={styles.dishRow}>
            <Text style={styles.dishName}>{item}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.black,
  },
  header: {
    paddingHorizontal: 8,
  },
  back: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backPressed: {
    opacity: 0.7,
  },
  backText: {
    color: colors.successAccent,
    fontSize: 16,
    fontWeight: '700',
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
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.borderDark,
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
    backgroundColor: colors.surfaceDark,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.borderDark,
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
    backgroundColor: colors.surfaceMid,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.borderDark,
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
  dishList: {
    flex: 1,
  },
  rawHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 8,
  },
  rawScroll: {
    maxHeight: 260,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderDark,
    backgroundColor: colors.surfaceMid,
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
  listContent: {
    paddingBottom: 24,
  },
  listEmpty: {
    flexGrow: 1,
  },
  emptyBox: {
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  emptyHint: {
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  dishRow: {
    backgroundColor: colors.surfaceDark,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.borderDark,
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
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.borderDark,
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
