import React, {useCallback, useMemo, useState} from 'react';
import {ActivityIndicator, FlatList, Image, RefreshControl, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {InventoryItem} from './domain/types';
import {SwipeToDeleteCard} from './components/SwipeToDeleteCard';
import {ProductRepository} from './infrastructure/ProductRepository';
import {colors} from './theme/colors';
import {compareExpiry, formatExpiryLine} from './utils/inventory';

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
};

export default function HomeView({refreshToken}: HomeViewProps) {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('expiry_asc');

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

  const renderItem = useCallback(
    ({item}: {item: InventoryItem}) => (
      <SwipeToDeleteCard
        onDelete={() => {
          deleteItem(item.id).catch(() => {});
        }}>
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
              </View>
            </View>
          </View>
        </View>
      </SwipeToDeleteCard>
    ),
    [deleteItem],
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
