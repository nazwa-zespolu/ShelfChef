import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Image,
  RefreshControl,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Check, X} from 'lucide-react-native';
import {InventoryItem} from './domain/types';
import {SwipeToDeleteCard} from './components/SwipeToDeleteCard';
import {ProductRepository} from './infrastructure/ProductRepository';
import {colors} from './theme/colors';
import {compareExpiry, formatExpiryLine, formatOpenedLine} from './utils/inventory';

const repo = new ProductRepository();

type SortKey = 'name_asc' | 'name_desc' | 'expiry_asc' | 'expiry_desc';

const SORT_OPTIONS: {key: SortKey; label: string}[] = [
  {key: 'name_asc', label: 'Nazwa A–Z'},
  {key: 'name_desc', label: 'Nazwa Z–A'},
  {key: 'expiry_asc', label: 'Ważność: bliższe'},
  {key: 'expiry_desc', label: 'Ważność: późniejsze'},
];

type HomeViewProps = {
  refreshToken?: number;
  shouldPlaySwipeHint?: boolean;
  onInventoryCountChanged?: (count: number) => void;
  onSwipeHintPlayed?: () => void;
};

type ToastTone = 'success' | 'error';

type ToastMessage = {
  message: string;
  tone: ToastTone;
};

export default function HomeView({
  refreshToken,
  shouldPlaySwipeHint = false,
  onInventoryCountChanged,
  onSwipeHintPlayed,
}: HomeViewProps) {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('expiry_asc');
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const toastAnim = useRef(new Animated.Value(0)).current;
  const toastRunId = useRef(0);
  const hintTranslateX = useRef(new Animated.Value(0)).current;
  const [swipeHintVisible, setSwipeHintVisible] = useState(false);

  const toastTop = useMemo(() => insets.top + 12, [insets.top]);

  const showToast = useCallback(
    (message: string, tone: ToastTone = 'success') => {
      const runId = toastRunId.current + 1;
      toastRunId.current = runId;
      toastAnim.stopAnimation();
      toastAnim.setValue(0);
      setToast({message, tone});
      Animated.sequence([
        Animated.timing(toastAnim, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.delay(1450),
        Animated.timing(toastAnim, {
          toValue: 2,
          duration: 240,
          useNativeDriver: true,
        }),
      ]).start(({finished}) => {
        if (finished && toastRunId.current === runId) {
          setToast(null);
        }
      });
    },
    [toastAnim],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await repo.getFullInventory();
      setItems(all);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load().catch(() => {});
  }, [load, refreshToken]);

  useEffect(() => {
    if (loading) {
      return;
    }
    onInventoryCountChanged?.(items.length);
  }, [items.length, loading, onInventoryCountChanged]);

  const filteredSorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = items;
    if (q) {
      list = items.filter(i => {
        const hay = [i.name, i.brand]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      });
    }
    const copy = [...list];
    if (sortKey === 'name_asc' || sortKey === 'name_desc') {
      const mul = sortKey === 'name_asc' ? 1 : -1;
      copy.sort((a, b) => mul * a.name.localeCompare(b.name, 'pl', {sensitivity: 'base'}));
    } else {
      const mul = sortKey === 'expiry_asc' ? 1 : -1;
      copy.sort((a, b) => mul * compareExpiry(a, b));
    }
    return copy;
  }, [items, query, sortKey]);

  const deleteItem = useCallback(async (id: string) => {
    try {
      await repo.removeFromInventory(id);
      setItems(prev => prev.filter(p => p.id !== id));
    } catch {
      // jeśli usuwanie nie przejdzie, wróć do spójnego stanu z bazą
      load().catch(() => {});
    }
  }, [load]);

  const toggleOpened = useCallback(
    async (item: InventoryItem) => {
      try {
        if (item.isOpened) {
          await repo.markAsClosed(item.id);
          setItems(prev =>
            prev.map(product =>
              product.id === item.id
                ? {...product, isOpened: false, openedAt: undefined}
                : product,
            ),
          );
          showToast(`Cofnięto otwarcie: ${item.name}`);
          return;
        }

        const openedAt = new Date().toISOString();
        await repo.markAsOpened(item.id, openedAt);
        setItems(prev =>
          prev.map(product =>
            product.id === item.id ? {...product, isOpened: true, openedAt} : product,
          ),
        );
        showToast(`Otworzono produkt: ${item.name}`);
      } catch {
        load().catch(() => {});
        showToast('Nie udało się zaktualizować produktu', 'error');
      }
    },
    [load, showToast],
  );

  useEffect(() => {
    if (!shouldPlaySwipeHint || loading || filteredSorted.length === 0) {
      return;
    }
    setSwipeHintVisible(true);
    hintTranslateX.setValue(0);
    let active = true;
    const animation = Animated.sequence([
      Animated.delay(520),
      Animated.timing(hintTranslateX, {
        toValue: 86,
        duration: 460,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.delay(170),
      Animated.timing(hintTranslateX, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.delay(180),
      Animated.timing(hintTranslateX, {
        toValue: -86,
        duration: 460,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.delay(170),
      Animated.timing(hintTranslateX, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    animation.start(() => {
      if (active) {
        setSwipeHintVisible(false);
        onSwipeHintPlayed?.();
      }
    });
    return () => {
      active = false;
      animation.stop();
    };
  }, [filteredSorted.length, hintTranslateX, loading, onSwipeHintPlayed, shouldPlaySwipeHint]);

  const renderItem = useCallback(
    ({item, index}: {item: InventoryItem; index: number}) => {
      const openedLine = formatOpenedLine(item);
      const playSwipeHint = index === 0 && swipeHintVisible;
      return (
        <SwipeToDeleteCard
          resetAfterDelete
          allowRightDelete={false}
          onDelete={() => {
            deleteItem(item.id).catch(() => {});
          }}
          onSwipeRight={() => {
            toggleOpened(item).catch(() => {});
          }}
          rightLabel={item.isOpened ? 'Cofnij' : 'Otwórz'}
          rightActionTone={item.isOpened ? 'warning' : 'success'}>
          {playSwipeHint ? (
            <View pointerEvents="none" style={styles.swipeHintBackground}>
              <View
                style={[
                  styles.swipeHintAction,
                  item.isOpened ? styles.swipeHintActionUndo : styles.swipeHintActionOpen,
                ]}>
                <Text style={[styles.swipeHintActionText, item.isOpened && styles.swipeHintActionTextUndo]}>
                  {item.isOpened ? 'Cofnij' : 'Otwórz'}
                </Text>
              </View>
              <View style={[styles.swipeHintAction, styles.swipeHintActionDelete]}>
                <Text style={styles.swipeHintActionText}>Usuń</Text>
              </View>
            </View>
          ) : null}
          <Animated.View style={{transform: [{translateX: playSwipeHint ? hintTranslateX : 0}]}}>
            <View style={styles.card}>
              <View style={styles.cardRow}>
                {item.imageUrl ? <Image source={{uri: item.imageUrl}} style={styles.productImage} /> : null}
                <View style={styles.cardBody}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.productName} numberOfLines={2}>
                      {item.name}
                    </Text>
                    {item.isOpened ? (
                      <View style={styles.badgeOpen}>
                        <Text style={styles.badgeOpenText}>Otwarte</Text>
                      </View>
                    ) : null}
                  </View>
                  {item.brand ? <Text style={styles.brand}>{item.brand}</Text> : null}
                  <View style={styles.cardMeta}>
                    <Text style={styles.metaLine}>
                      Ważne do: <Text style={styles.metaValue}>{formatExpiryLine(item.expiryDate)}</Text>
                    </Text>
                    {openedLine ? (
                      <Text style={styles.metaLine}>
                        <Text style={styles.openedMetaValue}>{openedLine}</Text>
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>
            </View>
          </Animated.View>
        </SwipeToDeleteCard>
      );
    },
    [deleteItem, hintTranslateX, swipeHintVisible, toggleOpened],
  );

  return (
    <View style={[styles.root, {paddingTop: insets.top + 8}]}>
      <View style={styles.topBar}>
        <Text style={styles.screenTitle}>ShelfChef</Text>
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Szukaj produktu..."
          placeholderTextColor={colors.textMuted}
          style={styles.search}
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>

      <Text style={styles.sortLabel}>Sortowanie</Text>
      <View style={styles.sortRow}>
        {SORT_OPTIONS.map(opt => {
          const active = sortKey === opt.key;
          return (
            <Pressable
              key={opt.key}
              onPress={() => setSortKey(opt.key)}
              style={({pressed}) => [
                styles.sortChip,
                active && styles.sortChipActive,
                pressed && !active && styles.sortChipPressed,
              ]}>
              <Text style={[styles.sortChipText, active && styles.sortChipTextActive]} numberOfLines={1}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading && items.length === 0 ? (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={colors.success} />
        </View>
      ) : (
        <FlatList
          data={filteredSorted}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.listContent,
            filteredSorted.length === 0 && styles.listEmpty,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={loading && items.length > 0}
              onRefresh={load}
              tintColor={colors.success}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>Brak produktów</Text>
              <Text style={styles.emptyHint}>
                Dodaj produkt z poziomu zakładki skanowania, aby zobaczyć go tutaj.
              </Text>
            </View>
          }
        />
      )}
      {toast ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.toastOverlay,
            {
              top: toastTop,
              opacity: toastAnim.interpolate({
                inputRange: [0, 1, 2],
                outputRange: [0, 1, 0],
              }),
              transform: [
                {
                  translateY: toastAnim.interpolate({
                    inputRange: [0, 1, 2],
                    outputRange: [8, 0, -14],
                  }),
                },
              ],
            },
          ]}>
          <View style={[styles.toastBubble, toast.tone === 'error' && styles.toastBubbleError]}>
            <View style={[styles.toastIcon, toast.tone === 'error' && styles.toastIconError]}>
              {toast.tone === 'error' ? (
                <X color={colors.successText} size={15} strokeWidth={3} />
              ) : (
                <Check color={colors.successText} size={15} strokeWidth={3} />
              )}
            </View>
            <Text style={styles.toastText} numberOfLines={1}>
              {toast.message}
            </Text>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    paddingHorizontal: 22,
    marginBottom: 12,
  },
  screenTitle: {
    color: colors.textPrimary,
    fontSize: 36,
    fontWeight: '800',
  },
  searchWrap: {
    paddingHorizontal: 22,
    marginBottom: 10,
  },
  search: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 22,
    marginBottom: 6,
  },
  sortRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 18,
    gap: 8,
    marginBottom: 10,
  },
  sortChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: '48%',
  },
  sortChipActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  sortChipPressed: {
    opacity: 0.9,
  },
  sortChipText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  sortChipTextActive: {
    color: colors.accent,
  },
  listContent: {
    paddingHorizontal: 22,
    paddingBottom: 16,
  },
  listEmpty: {
    flexGrow: 1,
  },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  cardBody: {
    flex: 1,
    justifyContent: 'center',
  },
  productImage: {
    width: 58,
    height: 58,
    borderRadius: 10,
    backgroundColor: colors.surfaceMuted,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  productName: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  badgeOpen: {
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeOpenText: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
  },
  brand: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 4,
  },
  cardMeta: {
    marginTop: 8,
    gap: 4,
  },
  metaLine: {
    color: colors.textMuted,
    fontSize: 12,
  },
  metaValue: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  openedMetaValue: {
    color: colors.accent,
    fontWeight: '700',
  },
  swipeHintBackground: {
    ...StyleSheet.absoluteFill,
    borderRadius: 14,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  swipeHintAction: {
    flex: 1,
    minHeight: 84,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  swipeHintActionOpen: {
    alignItems: 'flex-start',
    backgroundColor: colors.success,
  },
  swipeHintActionUndo: {
    alignItems: 'flex-start',
    backgroundColor: colors.warning,
  },
  swipeHintActionDelete: {
    alignItems: 'flex-end',
    backgroundColor: colors.danger,
  },
  swipeHintActionText: {
    color: colors.successText,
    fontWeight: '900',
    fontSize: 16,
  },
  swipeHintActionTextUndo: {
    color: colors.warningText,
  },
  toastOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 1000,
    elevation: 1000,
    alignItems: 'center',
  },
  toastBubble: {
    maxWidth: 520,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.success,
    backgroundColor: colors.surfaceSubtle,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  toastBubbleError: {
    borderColor: colors.danger,
  },
  toastIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastIconError: {
    backgroundColor: colors.danger,
  },
  toastText: {
    flexShrink: 1,
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '900',
  },
  emptyBox: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyHint: {
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
});
