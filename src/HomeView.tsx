import React, {useCallback, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
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
  onOpenScan: () => void;
  onOpenRecipes: () => void;
  onOpenShopping: () => void;
};

export default function HomeView({onOpenScan, onOpenRecipes, onOpenShopping}: HomeViewProps) {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('expiry_asc');
  const [menuOpen, setMenuOpen] = useState(false);

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
    void load();
  }, [load]);

  const filteredSorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = items;
    if (q) {
      list = items.filter(i => {
        const hay = [i.name, i.brand, i.ean, i.category]
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
      void load();
    }
  }, [load]);

  const renderItem = useCallback(
    ({item}: {item: InventoryItem}) => (
      <SwipeToDeleteCard onDelete={() => void deleteItem(item.id)}>
        <View style={styles.card}>
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
            {item.ean ? (
              <Text style={styles.metaLine}>
                EAN: <Text style={styles.ean}>{item.ean}</Text>
              </Text>
            ) : null}
            {item.category ? (
              <View style={styles.categoryPill}>
                <Text style={styles.categoryText}>{item.category}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </SwipeToDeleteCard>
    ),
    [deleteItem],
  );

  return (
    <View style={[styles.root, {paddingTop: insets.top + 8}]}>
      <View style={styles.topBar}>
        <Text style={styles.screenTitle}>Moje zapasy</Text>
        <Pressable
          onPress={() => setMenuOpen(true)}
          style={({pressed}) => [styles.menuButton, pressed && styles.menuButtonPressed]}
          hitSlop={8}>
          <Text style={styles.menuButtonText}>Menu</Text>
        </Pressable>
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Szukaj: nazwa, marka, EAN, kategoria…"
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
                Dodaj produkty skanerem (Menu → Skaner) albo w przyszłych wersjach ręcznie.
              </Text>
              <Pressable style={styles.emptyCta} onPress={onOpenScan}>
                <Text style={styles.emptyCtaText}>Otwórz skaner</Text>
              </Pressable>
            </View>
          }
        />
      )}

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setMenuOpen(false)}>
          <View style={styles.modalSheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Przejdź do</Text>
            <Pressable
              style={({pressed}) => [styles.modalRow, pressed && styles.modalRowPressed]}
              onPress={() => {
                setMenuOpen(false);
                onOpenScan();
              }}>
              <Text style={styles.modalRowText}>Skaner produktów</Text>
            </Pressable>
            <Pressable
              style={({pressed}) => [styles.modalRow, pressed && styles.modalRowPressed]}
              onPress={() => {
                setMenuOpen(false);
                onOpenRecipes();
              }}>
              <Text style={styles.modalRowText}>Generator przepisów</Text>
            </Pressable>
            <Pressable
              style={({pressed}) => [styles.modalRow, pressed && styles.modalRowPressed]}
              onPress={() => {
                setMenuOpen(false);
                onOpenShopping();
              }}>
              <Text style={styles.modalRowText}>Lista zakupów</Text>
            </Pressable>
            <Pressable
              style={({pressed}) => [styles.modalRowCancel, pressed && styles.modalRowPressed]}
              onPress={() => setMenuOpen(false)}>
              <Text style={styles.modalRowCancelText}>Zamknij</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.black,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  screenTitle: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
  },
  menuButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.surfaceSoft,
  },
  menuButtonPressed: {
    opacity: 0.85,
  },
  menuButtonText: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
  searchWrap: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  search: {
    backgroundColor: colors.surfaceMid,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.borderDark,
  },
  sortLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 16,
    marginBottom: 6,
  },
  sortRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    gap: 8,
    marginBottom: 10,
  },
  sortChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.surfaceMid,
    borderWidth: 1,
    borderColor: colors.borderDark,
    maxWidth: '48%',
  },
  sortChipActive: {
    backgroundColor: colors.success,
    borderColor: colors.success,
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
    color: colors.successText,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
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
    backgroundColor: colors.surfaceDark,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.borderDark,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  productName: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
  },
  badgeOpen: {
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeOpenText: {
    color: colors.successAccent,
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
    fontSize: 13,
  },
  metaValue: {
    color: colors.infoText,
    fontWeight: '600',
  },
  ean: {
    color: colors.successAccent,
    fontWeight: '600',
  },
  categoryPill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceMid,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 4,
  },
  categoryText: {
    color: colors.textSecondary,
    fontSize: 12,
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
    marginBottom: 16,
  },
  emptyCta: {
    backgroundColor: colors.success,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  emptyCtaText: {
    color: colors.successText,
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 24,
  },
  modalSheet: {
    backgroundColor: colors.surfaceDark,
    borderRadius: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.borderDark,
  },
  modalTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  modalRow: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  modalRowPressed: {
    backgroundColor: colors.surfaceMid,
  },
  modalRowText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  modalRowCancel: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: colors.borderDark,
    marginTop: 4,
  },
  modalRowCancelText: {
    color: colors.textMuted,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});
