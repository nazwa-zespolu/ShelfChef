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
import {CalendarDays, Clock3, Package, Search} from 'lucide-react-native';
import {InventoryItem} from './domain/types';
import {SwipeToDeleteCard} from './components/SwipeToDeleteCard';
import {AppToast, useAppToast} from './components/AppToast';
import {ProductRepository} from './infrastructure/ProductRepository';
import {colors} from './theme/colors';
import {compareExpiry, formatExpiryLine} from './utils/inventory';

const repo = new ProductRepository();

type SortKey = 'name' | 'expiry_asc' | 'opened' | 'created_desc';

const SORT_OPTIONS: {key: SortKey; label: string}[] = [
  {key: 'name', label: 'Nazwa'},
  {key: 'expiry_asc', label: 'Ważność'},
  {key: 'created_desc', label: 'Dodane'},
  {key: 'opened', label: 'Otwarte'},
];

let rememberedSortKey: SortKey = 'expiry_asc';

type HomeViewProps = {
  refreshToken?: number;
  shouldPlaySwipeHint?: boolean;
  onInventoryCountChanged?: (count: number) => void;
  onSwipeHintPlayed?: () => void;
};

function pluralizeProducts(count: number) {
  if (count === 1) {
    return '1 produkt';
  }
  if (count > 1 && count < 5) {
    return `${count} produkty`;
  }
  return `${count} produktów`;
}

function openedProductsLabel(count: number) {
  if (count === 1) {
    return '1 otwarty';
  }
  return `${count} otwarte`;
}

function getOpenedTimestamp(item: InventoryItem) {
  if (!item.openedAt) {
    return 0;
  }
  const timestamp = new Date(item.openedAt).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function compareOpened(a: InventoryItem, b: InventoryItem) {
  if (a.isOpened !== b.isOpened) {
    return a.isOpened ? -1 : 1;
  }

  const openedDiff = getOpenedTimestamp(b) - getOpenedTimestamp(a);
  if (openedDiff !== 0) {
    return openedDiff;
  }

  const expiryDiff = compareExpiry(a, b);
  if (expiryDiff !== 0) {
    return expiryDiff;
  }

  return a.name.localeCompare(b.name, 'pl', {sensitivity: 'base'});
}

function getCreatedTimestamp(item: InventoryItem) {
  const timestamp = new Date(item.createdAt).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function compareCreatedDesc(a: InventoryItem, b: InventoryItem) {
  const createdDiff = getCreatedTimestamp(b) - getCreatedTimestamp(a);
  if (createdDiff !== 0) {
    return createdDiff;
  }

  const expiryDiff = compareExpiry(a, b);
  if (expiryDiff !== 0) {
    return expiryDiff;
  }

  return a.name.localeCompare(b.name, 'pl', {sensitivity: 'base'});
}

function formatOpenedBadgeDuration(openedAt?: string | null) {
  if (!openedAt) {
    return null;
  }

  const openedTimestamp = new Date(openedAt).getTime();
  if (Number.isNaN(openedTimestamp)) {
    return null;
  }

  const elapsedMs = Math.max(0, Date.now() - openedTimestamp);
  const elapsedMinutes = Math.max(1, Math.floor(elapsedMs / 60_000));
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes} min`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${elapsedHours} h`;
  }

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays === 1) {
    return '1 dzień';
  }
  return `${elapsedDays} dni`;
}

function getCategoryLabel(item: InventoryItem) {
  return item.category?.trim() || item.brand?.trim() || null;
}

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
  const [sortKey, setSortKey] = useState<SortKey>(rememberedSortKey);
  const {toast, toastAnim, showToast} = useAppToast();
  const hintTranslateX = useRef(new Animated.Value(0)).current;
  const [swipeHintVisible, setSwipeHintVisible] = useState(false);
  const openedCount = useMemo(() => items.filter(item => item.isOpened).length, [items]);
  const inventoryMeta = `${pluralizeProducts(items.length)} · ${openedProductsLabel(openedCount)}`;
  const toastTop = useMemo(() => insets.top + 12, [insets.top]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await repo.getFullInventory();
      setItems(all);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
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
        const hay = [i.name, i.category, i.brand]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      });
    }
    const copy = [...list];
    if (sortKey === 'name') {
      copy.sort((a, b) => a.name.localeCompare(b.name, 'pl', {sensitivity: 'base'}));
    } else if (sortKey === 'opened') {
      copy.sort(compareOpened);
    } else if (sortKey === 'created_desc') {
      copy.sort(compareCreatedDesc);
    } else {
      copy.sort(compareExpiry);
    }
    return copy;
  }, [items, query, sortKey]);

  const deleteItem = useCallback(
    async (item: InventoryItem) => {
      try {
        await repo.removeFromInventory(item.id);
        setItems(prev => prev.filter(p => p.id !== item.id));
        showToast(`Usunięto produkt: ${item.name}`);
      } catch {
        load().catch(() => {});
        showToast('Nie udało się usunąć produktu', 'error');
      }
    },
    [load, showToast],
  );

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
      const openedDuration = item.isOpened ? formatOpenedBadgeDuration(item.openedAt) : null;
      const categoryLabel = getCategoryLabel(item);
      const playSwipeHint = index === 0 && swipeHintVisible;

      return (
        <SwipeToDeleteCard
          resetAfterDelete
          allowRightDelete={false}
          borderRadius={8}
          onDelete={() => {
            deleteItem(item).catch(() => {});
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
          <Animated.View
            style={playSwipeHint ? {transform: [{translateX: hintTranslateX}]} : undefined}>
            <View style={styles.card}>
              <View style={styles.cardRow}>
                {item.imageUrl ? (
                  <Image source={{uri: item.imageUrl}} style={styles.productImage} />
                ) : (
                  <View style={styles.productImagePlaceholder}>
                    <Package color={colors.textMuted} size={28} strokeWidth={2} />
                  </View>
                )}
                <View style={styles.cardBody}>
                  <View style={styles.cardHeader}>
                    <Text
                      style={[styles.productName, openedDuration && styles.productNameWithBadge]}
                      numberOfLines={1}
                      ellipsizeMode="tail">
                      {item.name}
                    </Text>
                    {openedDuration ? (
                      <View style={styles.openedBadge}>
                        <Clock3 color={colors.accent} size={15} strokeWidth={2.1} />
                        <Text style={styles.openedBadgeText}>{openedDuration}</Text>
                      </View>
                    ) : null}
                  </View>
                  {categoryLabel ? (
                    <Text style={styles.category} numberOfLines={1}>
                      {categoryLabel}
                    </Text>
                  ) : null}
                  {item.expiryDate ? (
                    <View style={styles.expiryRow}>
                      <CalendarDays color={colors.textMuted} size={17} strokeWidth={2} />
                      <Text style={styles.metaLine}>
                        Ważne do: <Text style={styles.metaValue}>{formatExpiryLine(item.expiryDate)}</Text>
                      </Text>
                    </View>
                  ) : null}
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
        <Text style={styles.screenTitle}>Spiżarnia</Text>
        <Text style={styles.screenMeta}>{inventoryMeta}</Text>
      </View>

      <View style={styles.searchWrap}>
        <View style={styles.searchBox}>
          <Search color={colors.textMuted} size={22} strokeWidth={2.1} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Szukaj produktu..."
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>
      </View>

      <View style={styles.sortRow}>
        {SORT_OPTIONS.map(opt => {
          const active = sortKey === opt.key;
          return (
            <Pressable
              key={opt.key}
              onPress={() => {
                rememberedSortKey = opt.key;
                setSortKey(opt.key);
              }}
              style={({pressed}) => [
                styles.sortChip,
                active && styles.sortChipActive,
                pressed && styles.pressed,
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
      <AppToast toast={toast} animatedValue={toastAnim} top={toastTop} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    marginBottom: 16,
  },
  screenTitle: {
    color: colors.textPrimary,
    fontSize: 34,
    fontWeight: '900',
  },
  screenMeta: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 6,
  },
  searchWrap: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  searchBox: {
    minHeight: 52,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    shadowColor: colors.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 4},
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 16,
    paddingVertical: 0,
  },
  sortRow: {
    minHeight: 48,
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
    padding: 5,
    gap: 4,
    shadowColor: colors.shadow,
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 3},
    elevation: 1,
  },
  sortChip: {
    flex: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  sortChipActive: {
    backgroundColor: colors.success,
  },
  sortChipText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  sortChipTextActive: {
    color: colors.successText,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 96,
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
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 6},
    elevation: 3,
  },
  cardRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  cardBody: {
    flex: 1,
    justifyContent: 'center',
    position: 'relative',
  },
  productImage: {
    width: 72,
    height: 72,
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted,
  },
  productImagePlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeader: {
    minHeight: 21,
    justifyContent: 'center',
  },
  productName: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '900',
    minWidth: 0,
  },
  productNameWithBadge: {
    paddingRight: 92,
  },
  openedBadge: {
    position: 'absolute',
    top: -6,
    right: 0,
    minHeight: 34,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 0,
  },
  openedBadgeText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '900',
  },
  category: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 5,
  },
  expiryRow: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  metaLine: {
    color: colors.textMuted,
    fontSize: 13,
  },
  metaValue: {
    color: colors.textSecondary,
    fontWeight: '900',
  },
  swipeHintBackground: {
    ...StyleSheet.absoluteFill,
    borderRadius: 8,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  swipeHintAction: {
    flex: 1,
    minHeight: 92,
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
  pressed: {
    opacity: 0.78,
  },
});
