import React, {useCallback, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Animated,
  Alert,
  BackHandler,
  type DimensionValue,
  FlatList,
  Modal,
  PanResponder,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Check, ClipboardList, Link, Lock, Package, Plus, RefreshCcw, Search, ShoppingBag, Unlock} from 'lucide-react-native';
import {
  AutoShoppingListItemState,
  CatalogProduct,
  ShoppingItemStatus,
  ShoppingListIconColorKey,
  ShoppingListIconKey,
  ShoppingListSummary,
  ShoppingListType,
  ShoppingSuggestion,
} from './domain/types';
import {ShoppingList} from './app/ShoppingList';
import {ProductRepository} from './infrastructure/ProductRepository';
import {ShoppingListRepository} from './infrastructure/ShoppingListRepository';
import {SwipeToDeleteCard} from './components/SwipeToDeleteCard';
import {
  DEFAULT_SHOPPING_LIST_ICON_COLOR_KEY,
  getShoppingListIconColorDefinition,
  getShoppingListIconDefinition,
  SHOPPING_LIST_ICON_COLORS,
  SHOPPING_LIST_ICONS,
} from './shoppingListIcons';
import {colors} from './theme/colors';

type ShoppingListViewProps = {
  onRequestClose: () => void;
  onInventoryChanged?: () => void;
  setBottomNavVisible?: (visible: boolean) => void;
};

type ScreenMode = 'lists' | 'suggestions' | 'details';
type ListFilter = 'all' | 'manual' | 'auto';

type ShoppingListCardStats = {
  itemCount: number;
  purchasedCount: number;
};

const LIST_FILTERS: {key: ListFilter; label: string}[] = [
  {key: 'all', label: 'Wszystkie'},
  {key: 'manual', label: 'Manualne'},
  {key: 'auto', label: 'Auto'},
];

const EMPTY_LIST_STATS: ShoppingListCardStats = {
  itemCount: 0,
  purchasedCount: 0,
};

const shoppingRepository = new ShoppingListRepository();
const productRepository = new ProductRepository();
const shoppingList = new ShoppingList(shoppingRepository, productRepository);

function listTypeBadge(type: ShoppingListType) {
  return type === 'auto' ? 'Auto' : 'Manualna';
}

function pluralizeItems(count: number) {
  if (count === 1) {
    return '1 pozycja';
  }
  if (count > 1 && count < 5) {
    return `${count} pozycje`;
  }
  return `${count} pozycji`;
}

function purchasedLabel(count: number) {
  if (count === 1) {
    return '1 kupiona';
  }
  return `${count} kupionych`;
}

function shortageLabel(count: number) {
  if (count === 1) {
    return '1 brak';
  }
  if (count > 1 && count < 5) {
    return `${count} braki`;
  }
  return `${count} braków`;
}

function parseQuantityInput(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const quantity = Number.parseInt(trimmed, 10);
  return quantity > 0 ? quantity : null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Nieznany błąd';
}

export default function ShoppingListView({
  onRequestClose,
  onInventoryChanged,
  setBottomNavVisible,
}: ShoppingListViewProps) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<ScreenMode>('lists');
  const [lists, setLists] = useState<ShoppingListSummary[]>([]);
  const [suggestions, setSuggestions] = useState<ShoppingSuggestion[]>([]);
  const [selectedList, setSelectedList] = useState<ShoppingListSummary | null>(null);
  const [items, setItems] = useState<AutoShoppingListItemState[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createType, setCreateType] = useState<ShoppingListType>('manual');
  const [createIconKey, setCreateIconKey] = useState<ShoppingListIconKey>('basket');
  const [createIconColorKey, setCreateIconColorKey] = useState<ShoppingListIconColorKey>(
    DEFAULT_SHOPPING_LIST_ICON_COLOR_KEY,
  );
  const [addOpen, setAddOpen] = useState(false);
  const [addQuantity, setAddQuantity] = useState('1');
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogResults, setCatalogResults] = useState<CatalogProduct[]>([]);
  const [selectedCatalog, setSelectedCatalog] = useState<CatalogProduct | null>(null);
  const [linkingItem, setLinkingItem] = useState<AutoShoppingListItemState | null>(null);
  const [linkCatalogQuery, setLinkCatalogQuery] = useState('');
  const [linkCatalogResults, setLinkCatalogResults] = useState<CatalogProduct[]>([]);
  const [targetListId, setTargetListId] = useState<string | null>(null);
  const [pendingDeleteList, setPendingDeleteList] = useState<ShoppingListSummary | null>(null);
  const [listSearch, setListSearch] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [listFilter, setListFilter] = useState<ListFilter>('all');
  const [listStats, setListStats] = useState<Record<string, ShoppingListCardStats>>({});

  const manualLists = useMemo(() => lists.filter(list => list.type === 'manual'), [lists]);
  const filteredLists = useMemo(() => {
    const query = listSearch.trim().toLowerCase();
    return lists.filter(list => {
      if (listFilter !== 'all' && list.type !== listFilter) {
        return false;
      }
      if (!query) {
        return true;
      }
      return list.name.toLowerCase().includes(query);
    });
  }, [listFilter, listSearch, lists]);
  const filteredItems = useMemo(() => {
    const query = itemSearch.trim().toLowerCase();
    if (!query) {
      return items;
    }
    return items.filter(item => item.label.toLowerCase().includes(query));
  }, [itemSearch, items]);

  const loadLists = useCallback(async () => {
    setLoading(true);
    try {
      const [nextLists, nextSuggestions] = await Promise.all([
        shoppingRepository.getLists(),
        shoppingList.generateReplenishmentSuggestions(),
      ]);
      const statsEntries = await Promise.all(
        nextLists.map(async list => {
          const listItems = await shoppingRepository.getItems(list.id);
          return [
            list.id,
            {
              itemCount: listItems.length,
              purchasedCount: listItems.filter(item => item.status === 'purchased').length,
            },
          ] as const;
        }),
      );
      setLists(nextLists);
      setSuggestions(nextSuggestions);
      setListStats(Object.fromEntries(statsEntries));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSelectedList = useCallback(async (list: ShoppingListSummary) => {
    setLoading(true);
    try {
      const details = await shoppingList.getListWithEffectiveStatuses(list.id);
      setSelectedList(details.list);
      setItems(details.items);
      return details;
    } finally {
      setLoading(false);
    }
  }, []);

  const goBackOneLevel = useCallback(() => {
    if (pendingDeleteList) {
      setPendingDeleteList(null);
      return true;
    }
    if (addOpen) {
      setAddOpen(false);
      return true;
    }
    if (linkingItem) {
      setLinkingItem(null);
      return true;
    }
    if (createOpen) {
      setCreateOpen(false);
      return true;
    }
    if (mode === 'details' || mode === 'suggestions') {
      setMode('lists');
      return true;
    }

    onRequestClose();
    return true;
  }, [addOpen, createOpen, linkingItem, mode, onRequestClose, pendingDeleteList]);

  React.useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', goBackOneLevel);
    return () => subscription.remove();
  }, [goBackOneLevel]);

  React.useEffect(() => {
    if (mode === 'lists') {
      loadLists().catch(() => setLoading(false));
    }
  }, [loadLists, mode]);

  React.useEffect(() => {
    setBottomNavVisible?.(mode !== 'details');
  }, [mode, setBottomNavVisible]);

  React.useEffect(() => {
    return () => setBottomNavVisible?.(true);
  }, [setBottomNavVisible]);

  const openList = useCallback(
    (list: ShoppingListSummary) => {
      setItemSearch('');
      setMode('details');
      loadSelectedList(list).catch(() => setLoading(false));
    },
    [loadSelectedList],
  );

  const refreshCurrent = useCallback(async () => {
    if (mode === 'details' && selectedList) {
      await loadSelectedList(selectedList);
      return;
    }
    await loadLists();
  }, [loadLists, loadSelectedList, mode, selectedList]);

  const createList = useCallback(async () => {
    const name = createName.trim();
    if (!name) {
      return;
    }
    setBusy(true);
    try {
      const created = await shoppingList.createList(name, createType, createIconKey, createIconColorKey);
      setCreateName('');
      setCreateType('manual');
      setCreateIconKey('basket');
      setCreateIconColorKey(DEFAULT_SHOPPING_LIST_ICON_COLOR_KEY);
      setCreateOpen(false);
      await loadLists();
      openList(created);
    } finally {
      setBusy(false);
    }
  }, [createIconColorKey, createIconKey, createName, createType, loadLists, openList]);

  const moveList = useCallback(async (listId: string, direction: -1 | 1) => {
    const currentIndex = lists.findIndex(list => list.id === listId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= lists.length) {
      return;
    }
    const nextLists = [...lists];
    const [moved] = nextLists.splice(currentIndex, 1);
    nextLists.splice(nextIndex, 0, moved);
    const ordered = nextLists.map((list, index) => ({...list, sortOrder: index}));
    setLists(ordered);
    try {
      await shoppingRepository.updateListOrder(ordered.map(list => list.id));
    } catch {
      loadLists().catch(() => {});
    }
  }, [lists, loadLists]);

  const deleteList = useCallback(async () => {
    if (!pendingDeleteList) {
      return;
    }
    setBusy(true);
    try {
      await shoppingRepository.deleteList(pendingDeleteList.id);
      setPendingDeleteList(null);
      await loadLists();
    } finally {
      setBusy(false);
    }
  }, [loadLists, pendingDeleteList]);

  const openAddItem = useCallback(() => {
    setAddQuantity('1');
    setCatalogQuery('');
    setCatalogResults([]);
    setSelectedCatalog(null);
    setAddOpen(true);
  }, []);

  const searchCatalog = useCallback(async (query: string) => {
    setCatalogQuery(query);
    setSelectedCatalog(null);
    if (!query.trim()) {
      setCatalogResults([]);
      return;
    }
    const results = await shoppingRepository.searchCatalogProducts(query);
    setCatalogResults(results);
  }, []);

  const openCatalogLinks = useCallback((item: AutoShoppingListItemState) => {
    if (item.catalogProductId) {
      return;
    }
    setLinkingItem(item);
    setLinkCatalogQuery('');
    setLinkCatalogResults([]);
  }, []);

  const searchCatalogLinks = useCallback(async (query: string) => {
    setLinkCatalogQuery(query);
    if (!query.trim()) {
      setLinkCatalogResults([]);
      return;
    }
    const results = await shoppingRepository.searchCatalogProducts(query);
    setLinkCatalogResults(results);
  }, []);

  const linkCatalogProduct = useCallback(
    async (product: CatalogProduct) => {
      if (!selectedList || !linkingItem) {
        return;
      }
      setBusy(true);
      try {
        await shoppingRepository.linkCatalogProductToItem(linkingItem.id, product.id);
        const details = await loadSelectedList(selectedList);
        setLinkingItem(details.items.find(item => item.id === linkingItem.id) ?? null);
        setLinkCatalogQuery('');
        setLinkCatalogResults([]);
        const nextSuggestions = await shoppingList.generateReplenishmentSuggestions();
        setSuggestions(nextSuggestions);
      } finally {
        setBusy(false);
      }
    },
    [linkingItem, loadSelectedList, selectedList],
  );

  const unlinkCatalogProduct = useCallback(
    async (catalogProductId: string) => {
      if (!selectedList || !linkingItem) {
        return;
      }
      setBusy(true);
      try {
        await shoppingRepository.unlinkCatalogProductFromItem(linkingItem.id, catalogProductId);
        const details = await loadSelectedList(selectedList);
        setLinkingItem(details.items.find(item => item.id === linkingItem.id) ?? null);
        const nextSuggestions = await shoppingList.generateReplenishmentSuggestions();
        setSuggestions(nextSuggestions);
      } finally {
        setBusy(false);
      }
    },
    [linkingItem, loadSelectedList, selectedList],
  );

  const addItem = useCallback(async () => {
    if (!selectedList) {
      return;
    }
    const quantity = parseQuantityInput(addQuantity);
    if (quantity == null) {
      return;
    }
    const productLabel = catalogQuery.trim();
    if (!selectedCatalog && !productLabel) {
      return;
    }

    setBusy(true);
    try {
      if (selectedCatalog) {
        await shoppingList.addItem(selectedList.id, {
          catalogProductId: selectedCatalog.id,
          label: selectedCatalog.name,
          quantity,
        });
      } else {
        await shoppingList.addItem(selectedList.id, {
          label: productLabel,
          quantity,
        });
      }
      setAddOpen(false);
      await loadSelectedList(selectedList);
      const nextSuggestions = await shoppingList.generateReplenishmentSuggestions();
      setSuggestions(nextSuggestions);
    } finally {
      setBusy(false);
    }
  }, [addQuantity, catalogQuery, loadSelectedList, selectedCatalog, selectedList]);

  const updateStatus = useCallback(
    async (itemId: string, status: ShoppingItemStatus) => {
      if (!selectedList) {
        return;
      }
      setBusy(true);
      try {
        await shoppingList.updateItemStatus(itemId, status);
        await loadSelectedList(selectedList);
      } finally {
        setBusy(false);
      }
    },
    [loadSelectedList, selectedList],
  );

  const updateQuantity = useCallback(
    async (itemId: string, quantity: number) => {
      if (!selectedList) {
        return;
      }
      setBusy(true);
      try {
        await shoppingRepository.updateItemQuantity(itemId, quantity);
        await loadSelectedList(selectedList);
      } finally {
        setBusy(false);
      }
    },
    [loadSelectedList, selectedList],
  );

  const moveItem = useCallback(async (itemId: string, direction: -1 | 1) => {
    if (!selectedList || selectedList.type !== 'manual' || itemSearch.trim()) {
      return;
    }
    const currentIndex = items.findIndex(item => item.id === itemId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= items.length) {
      return;
    }
    const nextItems = [...items];
    const [moved] = nextItems.splice(currentIndex, 1);
    nextItems.splice(nextIndex, 0, moved);
    const ordered = nextItems.map((item, index) => ({...item, sortOrder: index}));
    setItems(ordered);
    try {
      await shoppingRepository.updateItemOrder(selectedList.id, ordered.map(item => item.id));
    } catch {
      loadSelectedList(selectedList).catch(() => {});
    }
  }, [itemSearch, items, loadSelectedList, selectedList]);

  const deleteItem = useCallback(
    async (itemId: string) => {
      if (!selectedList) {
        return;
      }
      setBusy(true);
      try {
        await shoppingRepository.deleteItem(itemId);
        await loadSelectedList(selectedList);
      } finally {
        setBusy(false);
      }
    },
    [loadSelectedList, selectedList],
  );

  const toggleLock = useCallback(async () => {
    if (!selectedList || selectedList.type !== 'auto') {
      return;
    }
    setBusy(true);
    try {
      await shoppingList.setListLocked(selectedList.id, !selectedList.isLocked);
      const updated = await shoppingRepository.getListById(selectedList.id);
      if (updated) {
        await loadSelectedList(updated);
      }
      await loadLists();
    } finally {
      setBusy(false);
    }
  }, [loadLists, loadSelectedList, selectedList]);

  const openSuggestions = useCallback(async () => {
    setMode('suggestions');
    setLoading(true);
    try {
      const nextSuggestions = await shoppingList.generateReplenishmentSuggestions();
      setSuggestions(nextSuggestions);
      const nextLists = await shoppingRepository.getLists();
      setLists(nextLists);
      setTargetListId(nextLists.find(list => list.type === 'manual')?.id ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  const mergeSuggestions = useCallback(async () => {
    if (!targetListId) {
      return;
    }
    setBusy(true);
    try {
      await shoppingList.addAllSuggestionsToList(targetListId);
      const [nextLists, nextSuggestions] = await Promise.all([
        shoppingRepository.getLists(),
        shoppingList.generateReplenishmentSuggestions(),
      ]);
      setLists(nextLists);
      setSuggestions(nextSuggestions);
    } finally {
      setBusy(false);
    }
  }, [targetListId]);

  const completePurchase = useCallback(async () => {
    if (!selectedList) {
      return;
    }
    setBusy(true);
    let completed = false;
    try {
      const purchased = items.filter(item => item.status === 'purchased');
      const payload: Record<string, string | null> = {};
      for (const item of purchased) {
        payload[item.id] = null;
      }
      await shoppingList.completePurchase(selectedList.id, payload);
      completed = true;
    } catch (e) {
      const message = getErrorMessage(e);
      console.error('[ShelfChef] completePurchase failed', e);
      Alert.alert('Błąd', `Nie udało się sfinalizować listy.\n\n${message}`);
      return;
    } finally {
      if (!completed) {
        setBusy(false);
      }
    }

    try {
      await loadSelectedList(selectedList);
      await loadLists();
      onInventoryChanged?.();
    } catch (e) {
      console.error('[ShelfChef] refresh after completePurchase failed', e);
    } finally {
      setBusy(false);
    }
  }, [items, loadLists, loadSelectedList, onInventoryChanged, selectedList]);

  const renderListRow = ({item}: {item: ShoppingListSummary}) => (
    <SortableListRow
      item={item}
      stats={listStats[item.id] ?? EMPTY_LIST_STATS}
      onOpen={openList}
      onMove={moveList}
      onRequestDelete={setPendingDeleteList}
    />
  );

  const renderManualItem = ({item}: {item: AutoShoppingListItemState}) => (
    <ManualShoppingItemRow
      item={item}
      busy={busy}
      reorderEnabled={itemSearch.trim().length === 0}
      onDelete={deleteItem}
      onMove={moveItem}
      onUpdateQuantity={updateQuantity}
      onUpdateStatus={updateStatus}
      onOpenLinks={openCatalogLinks}
    />
  );

  const renderAutoItem = ({item}: {item: AutoShoppingListItemState}) => (
    <AutoShoppingItemRow
      item={item}
      busy={busy}
      onDelete={deleteItem}
      onUpdateQuantity={updateQuantity}
      onOpenLinks={openCatalogLinks}
    />
  );

  const renderSuggestions = () => (
    <View style={styles.content}>
      <View style={styles.suggestionsHero}>
        <Pressable
          onPress={goBackOneLevel}
          style={({pressed}) => [styles.manualBackButton, pressed && styles.pressed]}
          hitSlop={10}>
          <Text style={styles.manualBackText}>‹ Wróć</Text>
        </Pressable>
        <Text style={styles.manualDetailsTitle} numberOfLines={1}>Do uzupełnienia</Text>
        <Text style={styles.manualDetailsMeta}>
          {suggestions.length === 1 ? '1 produkt do kupienia' : `${suggestions.length} produkty do kupienia`}
        </Text>
      </View>
      <View style={styles.mergeBar}>
        <Text style={styles.mergeLabel}>Dodaj do listy</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.targetRow}>
          {manualLists.map(list => {
            const active = targetListId === list.id;
            return (
              <Pressable
                key={list.id}
                onPress={() => setTargetListId(list.id)}
                style={({pressed}) => [
                  styles.targetChip,
                  active && styles.targetChipActive,
                  pressed && styles.pressed,
                ]}>
                <Text style={[styles.targetChipText, active && styles.targetChipTextActive]}>
                  {list.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Pressable
          disabled={!targetListId || suggestions.length === 0 || busy}
          onPress={mergeSuggestions}
          style={({pressed}) => [
            styles.primaryButton,
            styles.mergeButton,
            (!targetListId || suggestions.length === 0 || busy) && styles.disabled,
            pressed && styles.pressed,
          ]}>
          <View style={styles.inlineButtonContent}>
            <ShoppingBag color={colors.successText} size={20} strokeWidth={2.2} />
            <Text style={styles.primaryButtonText}>Dodaj do listy</Text>
          </View>
        </Pressable>
      </View>
      <FlatList
        data={suggestions}
        keyExtractor={item => item.catalogProductId ?? `text:${item.normalizedName}`}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={openSuggestions} tintColor={colors.success} />}
        contentContainerStyle={[styles.suggestionsContent, suggestions.length === 0 && styles.emptyContent]}
        renderItem={({item}) => (
          <View style={styles.suggestionItemCard}>
            <View style={styles.autoItemIcon}>
              <Package color={colors.accent} size={24} strokeWidth={2.1} />
            </View>
            <View style={styles.suggestionItemText}>
              <Text style={styles.manualItemTitle} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.manualItemMeta} numberOfLines={1}>{item.reason}</Text>
              <Text style={styles.suggestionSourceText} numberOfLines={1}>
                {item.sourceAutoListNames.join(', ')}
              </Text>
            </View>
            <View style={styles.suggestionMissingPill}>
              <Text style={styles.suggestionMissingText}>Brakuje {item.missingQuantity}</Text>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>Wszystko uzupełnione</Text>
          </View>
        }
      />
    </View>
  );

  const renderDetails = () => {
    if (!selectedList) {
      return null;
    }
    const purchasedCount = items.filter(item => item.effectiveStatus === 'purchased').length;
    const totalCount = items.length;
    const progress = totalCount > 0 ? purchasedCount / totalCount : 0;
    const progressPercent = `${Math.round(progress * 100)}%` as DimensionValue;
    if (selectedList.type === 'manual') {
      return (
        <View style={styles.content}>
          <View style={styles.manualDetailsHero}>
            <View style={styles.detailsTopRow}>
              <Pressable
                onPress={goBackOneLevel}
                style={({pressed}) => [styles.manualBackButton, pressed && styles.pressed]}
                hitSlop={10}>
                <Text style={styles.manualBackText}>‹ Wróć</Text>
              </Pressable>
              <View style={styles.manualTypeBadge}>
                <Text style={styles.manualTypeBadgeText}>Manualna</Text>
              </View>
            </View>
            <Text style={styles.manualDetailsTitle} numberOfLines={1}>{selectedList.name}</Text>
            <Text style={styles.manualDetailsMeta}>
              {pluralizeItems(totalCount)} · {purchasedLabel(purchasedCount)}
            </Text>
            <View style={styles.manualProgressTrack}>
              <View style={[styles.manualProgressFill, {width: progressPercent}]} />
            </View>
            <View style={styles.manualSearchBox}>
              <Search color={colors.textMuted} size={22} strokeWidth={2.1} />
              <TextInput
                value={itemSearch}
                onChangeText={setItemSearch}
                placeholder="Szukaj produktu..."
                placeholderTextColor={colors.textMuted}
                style={styles.manualSearchInput}
              />
            </View>
          </View>
          <FlatList
            data={filteredItems}
            keyExtractor={item => item.id}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={refreshCurrent} tintColor={colors.success} />}
            contentContainerStyle={[
              styles.manualItemsContent,
              filteredItems.length === 0 && styles.emptyContent,
            ]}
            renderItem={renderManualItem}
            ListEmptyComponent={
              <EmptyState title={items.length === 0 ? 'Pusta lista' : 'Brak pasujących produktów'} />
            }
          />
          <View style={[styles.manualBottomBar, {paddingBottom: insets.bottom + 10}]}>
            <Pressable
              onPress={openAddItem}
              style={({pressed}) => [styles.manualAddButton, pressed && styles.pressed]}>
              <Plus color={colors.success} size={22} strokeWidth={2.3} />
              <Text style={styles.manualAddButtonText}>Dodaj</Text>
            </Pressable>
            <Pressable
              disabled={purchasedCount === 0 || busy}
              onPress={() => { completePurchase().catch(() => {}); }}
              style={({pressed}) => [
                styles.manualFinalizeButton,
                (purchasedCount === 0 || busy) && styles.disabled,
                pressed && styles.pressed,
              ]}>
              <Check color={colors.successText} size={22} strokeWidth={2.3} />
              <Text style={styles.manualFinalizeButtonText}>Finalizuj</Text>
            </Pressable>
          </View>
        </View>
      );
    }
    const missingCount = items.filter(item => item.missingQuantity > 0).length;
    const coveredCount = Math.max(0, totalCount - missingCount);
    const autoProgress = totalCount > 0 ? coveredCount / totalCount : 0;
    const autoProgressPercent = `${Math.round(autoProgress * 100)}%` as DimensionValue;
    const AutoLockIcon = selectedList.isLocked ? Unlock : Lock;
    return (
      <View style={styles.content}>
        <View style={styles.autoDetailsHero}>
          <View style={styles.detailsTopRow}>
            <Pressable
              onPress={goBackOneLevel}
              style={({pressed}) => [styles.manualBackButton, pressed && styles.pressed]}
              hitSlop={10}>
              <Text style={styles.manualBackText}>‹ Wróć</Text>
            </Pressable>
            <View style={styles.autoBadgeRow}>
              <View style={styles.autoTypeBadge}>
                <Text style={styles.autoTypeBadgeText}>Auto</Text>
              </View>
              <View style={styles.autoLockBadge}>
                <Text style={styles.autoLockBadgeText}>
                  {selectedList.isLocked ? 'Zablokowana' : 'Aktywna'}
                </Text>
              </View>
            </View>
          </View>
          <Text style={styles.manualDetailsTitle} numberOfLines={1}>{selectedList.name}</Text>
          <Text style={styles.manualDetailsMeta}>
            {pluralizeItems(totalCount)} · {missingCount === 1 ? '1 do uzupełnienia' : `${missingCount} do uzupełnienia`}
          </Text>
          <View style={styles.manualProgressTrack}>
            <View style={[styles.manualProgressFill, {width: autoProgressPercent}]} />
          </View>
          <View style={styles.autoStatusRow}>
            <RefreshCcw color={colors.accent} size={21} strokeWidth={2.1} />
            <Text style={styles.autoStatusText}>
              {selectedList.isLocked ? 'Aktualizacja wstrzymana' : 'Aktualizuje się z zapasów'}
            </Text>
          </View>
          <View style={styles.manualSearchBox}>
            <Search color={colors.textMuted} size={22} strokeWidth={2.1} />
            <TextInput
              value={itemSearch}
              onChangeText={setItemSearch}
              placeholder="Szukaj produktu..."
              placeholderTextColor={colors.textMuted}
              style={styles.manualSearchInput}
            />
          </View>
        </View>
        <FlatList
          data={filteredItems}
          keyExtractor={item => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refreshCurrent} tintColor={colors.success} />}
          contentContainerStyle={[
            styles.manualItemsContent,
            filteredItems.length === 0 && styles.emptyContent,
          ]}
          renderItem={renderAutoItem}
          ListEmptyComponent={
            <EmptyState title={items.length === 0 ? 'Pusta lista' : 'Brak pasujących produktów'} />
          }
        />
        <View style={[styles.manualBottomBar, {paddingBottom: insets.bottom + 10}]}>
          <Pressable
            onPress={openAddItem}
            style={({pressed}) => [styles.manualAddButton, pressed && styles.pressed]}>
            <Plus color={colors.success} size={22} strokeWidth={2.3} />
            <Text style={styles.manualAddButtonText}>Dodaj</Text>
          </Pressable>
          <Pressable
            disabled={busy}
            onPress={() => { toggleLock().catch(() => {}); }}
            style={({pressed}) => [
              styles.manualFinalizeButton,
              busy && styles.disabled,
              pressed && styles.pressed,
            ]}>
            <AutoLockIcon color={colors.successText} size={21} strokeWidth={2.2} />
            <Text style={styles.manualFinalizeButtonText}>
              {selectedList.isLocked ? 'Odblokuj' : 'Zablokuj'}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const renderReplenishmentTile = () => (
    <Pressable
      onPress={openSuggestions}
      style={({pressed}) => [styles.replenishmentTile, pressed && styles.cardPressed]}>
      <View style={styles.replenishmentIcon}>
        {React.createElement(getShoppingListIconDefinition('refresh').Icon, {
          color: colors.accent,
          size: 42,
          strokeWidth: 2,
        })}
      </View>
      <View style={styles.replenishmentText}>
        <View style={styles.titleBadgeRow}>
          <Text style={styles.suggestionTitle}>Do uzupełnienia</Text>
          <View style={styles.suggestionBadge}>
            <Text style={styles.suggestionBadgeText}>Sugestie</Text>
          </View>
        </View>
        <Text style={styles.suggestionMeta}>
          {shortageLabel(suggestions.length)} z list auto
        </Text>
      </View>
      <Text style={styles.suggestionArrow}>›</Text>
    </Pressable>
  );

  const renderLists = () => (
    <View style={styles.content}>
      <View style={styles.listsHero}>
        <Text style={styles.screenTitle}>Listy zakupów</Text>
        <View style={styles.searchCreateRow}>
          <View style={styles.searchBox}>
            <Text style={styles.searchIcon}>⌕</Text>
            <TextInput
              value={listSearch}
              onChangeText={setListSearch}
              placeholder="Szukaj listy..."
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
            />
          </View>
          <Pressable
            onPress={() => setCreateOpen(true)}
            style={({pressed}) => [styles.newListButton, pressed && styles.pressed]}>
            <Text style={styles.newListButtonText}>Nowa</Text>
          </Pressable>
        </View>
        <View style={styles.filterBar}>
          {LIST_FILTERS.map(filter => {
            const active = filter.key === listFilter;
            return (
              <Pressable
                key={filter.key}
                onPress={() => setListFilter(filter.key)}
                style={({pressed}) => [
                  styles.filterSegment,
                  active && styles.filterSegmentActive,
                  pressed && styles.pressed,
                ]}>
                <Text style={[styles.filterSegmentText, active && styles.filterSegmentTextActive]}>
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <FlatList
        data={filteredLists}
        keyExtractor={item => item.id}
        renderItem={renderListRow}
        ListHeaderComponent={renderReplenishmentTile}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={<EmptyState title={lists.length === 0 ? 'Brak list' : 'Brak pasujących list'} />}
      />
    </View>
  );

  return (
    <View style={[styles.root, {paddingTop: insets.top + 2}]}>
      {mode === 'lists' ? renderLists() : null}
      {mode === 'suggestions' ? renderSuggestions() : null}
      {mode === 'details' ? renderDetails() : null}
      {loading && lists.length === 0 && mode === 'lists' ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={colors.success} />
        </View>
      ) : null}
      <CreateListModal
        visible={createOpen}
        name={createName}
        type={createType}
        iconKey={createIconKey}
        iconColorKey={createIconColorKey}
        busy={busy}
        onChangeName={setCreateName}
        onChangeType={setCreateType}
        onChangeIconKey={setCreateIconKey}
        onChangeIconColorKey={setCreateIconColorKey}
        onClose={() => setCreateOpen(false)}
        onSubmit={createList}
      />
      <AddItemModal
        visible={addOpen}
        quantity={addQuantity}
        catalogQuery={catalogQuery}
        catalogResults={catalogResults}
        selectedCatalog={selectedCatalog}
        busy={busy}
        onChangeQuantity={setAddQuantity}
        onChangeCatalogQuery={query => searchCatalog(query).catch(() => {})}
        onSelectCatalog={product => {
          setSelectedCatalog(product);
          setCatalogQuery(product.name);
        }}
        onClose={() => setAddOpen(false)}
        onSubmit={addItem}
      />
      <CatalogLinksModal
        item={linkingItem}
        query={linkCatalogQuery}
        results={linkCatalogResults}
        busy={busy}
        onChangeQuery={query => searchCatalogLinks(query).catch(() => {})}
        onLink={product => { linkCatalogProduct(product).catch(() => {}); }}
        onUnlink={catalogProductId => { unlinkCatalogProduct(catalogProductId).catch(() => {}); }}
        onClose={() => setLinkingItem(null)}
      />
      <DeleteListModal
        list={pendingDeleteList}
        busy={busy}
        onClose={() => setPendingDeleteList(null)}
        onSubmit={deleteList}
      />
    </View>
  );
}

function SortableListRow({
  item,
  stats,
  onOpen,
  onMove,
  onRequestDelete,
}: {
  item: ShoppingListSummary;
  stats: ShoppingListCardStats;
  onOpen: (item: ShoppingListSummary) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onRequestDelete: (item: ShoppingListSummary) => void;
}) {
  const translateY = useRef(new Animated.Value(0)).current;
  const dragActive = useRef(false);
  const dragTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const movedAt = useRef(0);
  const [dragging, setDragging] = useState(false);
  const Icon = getShoppingListIconDefinition(item.iconKey).Icon;
  const iconColor = getShoppingListIconColorDefinition(item.iconColorKey);

  const resetPosition = useCallback(() => {
    if (dragTimer.current) {
      clearTimeout(dragTimer.current);
      dragTimer.current = null;
    }
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      speed: 20,
      bounciness: 4,
    }).start();
    dragActive.current = false;
    setDragging(false);
  }, [translateY]);

  const dragResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          movedAt.current = 0;
          dragTimer.current = setTimeout(() => {
            dragActive.current = true;
            setDragging(true);
          }, 180);
        },
        onPanResponderMove: (_evt, gesture) => {
          if (!dragActive.current) {
            return;
          }
          translateY.setValue(gesture.dy);
          const now = Date.now();
          if (now - movedAt.current < 220) {
            return;
          }
          if (gesture.dy > 46) {
            movedAt.current = now;
            translateY.setValue(0);
            onMove(item.id, 1);
          } else if (gesture.dy < -46) {
            movedAt.current = now;
            translateY.setValue(0);
            onMove(item.id, -1);
          }
        },
        onPanResponderRelease: resetPosition,
        onPanResponderTerminate: resetPosition,
      }),
    [item.id, onMove, resetPosition, translateY],
  );

  return (
    <SwipeToDeleteCard
      resetAfterDelete
      borderRadius={8}
      allowRightDelete={false}
      onDelete={() => onRequestDelete(item)}>
      <Animated.View
        style={[
          {
            transform: [{translateY}],
          },
        ]}>
        <Pressable
          onPress={() => {
            if (!dragActive.current) {
              onOpen(item);
            }
          }}
          style={({pressed}) => [
            styles.card,
            styles.listCard,
            dragging && styles.cardDragging,
            pressed && styles.cardPressed,
          ]}>
          <View style={styles.rowBetween}>
            <View
              style={[styles.listIconBubble, {backgroundColor: iconColor.background}]}
              {...dragResponder.panHandlers}>
              <Icon color={iconColor.color} size={26} strokeWidth={2.2} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.cardMeta}>
                {pluralizeItems(stats.itemCount)} · {purchasedLabel(stats.purchasedCount)}
              </Text>
            </View>
            <View style={styles.listTrailing}>
              {item.type === 'auto' && item.isLocked ? (
                <View style={[styles.badge, styles.badgeMuted]}>
                  <Text style={[styles.badgeText, styles.badgeMutedText]}>Lock</Text>
                </View>
              ) : null}
              <View style={styles.listTrailingRow}>
                <View style={[styles.listTypePill, item.type === 'manual' ? styles.listTypePillManual : styles.listTypePillAuto]}>
                  <Text style={[styles.listTypePillText, item.type === 'manual' ? styles.listTypePillTextManual : styles.listTypePillTextAuto]}>
                    {listTypeBadge(item.type)}
                  </Text>
                </View>
                <Text style={styles.suggestionArrow}>›</Text>
              </View>
            </View>
          </View>
        </Pressable>
      </Animated.View>
    </SwipeToDeleteCard>
  );
}

function ManualShoppingItemRow({
  item,
  busy,
  reorderEnabled,
  onDelete,
  onMove,
  onUpdateQuantity,
  onUpdateStatus,
  onOpenLinks,
}: {
  item: AutoShoppingListItemState;
  busy: boolean;
  reorderEnabled: boolean;
  onDelete: (id: string) => Promise<void>;
  onMove: (id: string, direction: -1 | 1) => void;
  onUpdateQuantity: (id: string, quantity: number) => Promise<void>;
  onUpdateStatus: (id: string, status: ShoppingItemStatus) => Promise<void>;
  onOpenLinks: (item: AutoShoppingListItemState) => void;
}) {
  const translateY = useRef(new Animated.Value(0)).current;
  const dragActive = useRef(false);
  const dragTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const movedAt = useRef(0);
  const [dragging, setDragging] = useState(false);
  const isPurchased = item.effectiveStatus === 'purchased';
  const nextToggleStatus: ShoppingItemStatus = isPurchased ? 'planned' : 'purchased';
  const canDecrease = item.quantity > 1 && !busy;
  const ItemIcon = isPurchased ? Check : Package;

  const resetPosition = useCallback(() => {
    if (dragTimer.current) {
      clearTimeout(dragTimer.current);
      dragTimer.current = null;
    }
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      speed: 20,
      bounciness: 4,
    }).start();
    dragActive.current = false;
    setDragging(false);
  }, [translateY]);

  const dragResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => reorderEnabled,
        onMoveShouldSetPanResponder: (_evt, gesture) =>
          reorderEnabled && Math.abs(gesture.dy) > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderGrant: () => {
          movedAt.current = 0;
          dragTimer.current = setTimeout(() => {
            dragActive.current = true;
            setDragging(true);
          }, 180);
        },
        onPanResponderMove: (_evt, gesture) => {
          if (!dragActive.current) {
            return;
          }
          translateY.setValue(gesture.dy);
          const now = Date.now();
          if (now - movedAt.current < 220) {
            return;
          }
          if (gesture.dy > 46) {
            movedAt.current = now;
            translateY.setValue(0);
            onMove(item.id, 1);
          } else if (gesture.dy < -46) {
            movedAt.current = now;
            translateY.setValue(0);
            onMove(item.id, -1);
          }
        },
        onPanResponderRelease: resetPosition,
        onPanResponderTerminate: resetPosition,
      }),
    [item.id, onMove, reorderEnabled, resetPosition, translateY],
  );

  return (
    <SwipeToDeleteCard
      borderRadius={8}
      allowRightDelete={false}
      onDelete={() => { onDelete(item.id).catch(() => {}); }}
      onSwipeRight={() => { onUpdateStatus(item.id, nextToggleStatus).catch(() => {}); }}
      rightLabel={isPurchased ? 'Cofnij' : 'Kupione'}
      rightActionTone={isPurchased ? 'warning' : 'success'}>
      <Animated.View style={{transform: [{translateY}]}}>
        <View
          style={[
            styles.manualItemCard,
            isPurchased && styles.manualItemCardPurchased,
            dragging && styles.manualItemCardDragging,
          ]}>
          {isPurchased ? <View style={styles.manualItemStatusBar} /> : null}
          <View
            style={[styles.manualItemIcon, isPurchased && styles.manualItemIconPurchased]}
            {...dragResponder.panHandlers}>
            <ItemIcon
              color={isPurchased ? colors.success : colors.accent}
              size={24}
              strokeWidth={2.1}
            />
          </View>
          <View style={styles.manualItemText}>
            <Text
              style={[
                styles.manualItemTitle,
                isPurchased && styles.manualItemTitlePurchased,
              ]}
              numberOfLines={1}>
              {item.label}
            </Text>
            <Text style={styles.manualItemMeta} numberOfLines={1}>
              Masz {item.currentQuantity}
            </Text>
            {!item.catalogProductId ? (
              <Pressable
                onPress={() => onOpenLinks(item)}
                style={({pressed}) => [styles.itemCatalogLink, pressed && styles.pressed]}>
                <Link color={colors.accent} size={13} strokeWidth={2.1} />
                <Text style={styles.itemCatalogLinkText}>
                  {item.linkedCatalogProducts.length > 0
                    ? `Powiązania ${item.linkedCatalogProducts.length}`
                    : 'Powiąż katalog'}
                </Text>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.manualItemControls}>
            <View style={styles.manualQuantityStepper}>
              <Pressable
                disabled={!canDecrease}
                style={({pressed}) => [
                  styles.manualStepButton,
                  !canDecrease && styles.disabled,
                  pressed && styles.pressed,
                ]}
                onPress={() => onUpdateQuantity(item.id, item.quantity - 1)}>
                <Text style={styles.manualStepText}>−</Text>
              </Pressable>
              <Text style={styles.manualQuantityText}>{item.quantity}</Text>
              <Pressable
                disabled={busy}
                style={({pressed}) => [
                  styles.manualStepButton,
                  busy && styles.disabled,
                  pressed && styles.pressed,
                ]}
                onPress={() => onUpdateQuantity(item.id, item.quantity + 1)}>
                <Text style={styles.manualStepText}>+</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Animated.View>
    </SwipeToDeleteCard>
  );
}

function AutoShoppingItemRow({
  item,
  busy,
  onDelete,
  onUpdateQuantity,
  onOpenLinks,
}: {
  item: AutoShoppingListItemState;
  busy: boolean;
  onDelete: (id: string) => Promise<void>;
  onUpdateQuantity: (id: string, quantity: number) => Promise<void>;
  onOpenLinks: (item: AutoShoppingListItemState) => void;
}) {
  const canDecrease = item.quantity > 1 && !busy;
  return (
    <SwipeToDeleteCard
      borderRadius={8}
      allowRightDelete={false}
      onDelete={() => { onDelete(item.id).catch(() => {}); }}>
      <View style={styles.autoItemCard}>
        <View style={styles.autoItemIcon}>
          <Package color={colors.accent} size={24} strokeWidth={2.1} />
        </View>
        <View style={styles.autoItemText}>
          <Text style={styles.manualItemTitle} numberOfLines={1}>{item.label}</Text>
          <Text style={styles.manualItemMeta} numberOfLines={1}>
            Masz {item.currentQuantity} z {item.quantity}
          </Text>
          {!item.catalogProductId ? (
            <Pressable
              onPress={() => onOpenLinks(item)}
              style={({pressed}) => [styles.itemCatalogLink, pressed && styles.pressed]}>
              <Link color={colors.accent} size={13} strokeWidth={2.1} />
              <Text style={styles.itemCatalogLinkText}>
                {item.linkedCatalogProducts.length > 0
                  ? `Powiązania ${item.linkedCatalogProducts.length}`
                  : 'Powiąż katalog'}
              </Text>
            </Pressable>
          ) : null}
        </View>
        <View style={styles.manualQuantityStepper}>
          <Pressable
            disabled={!canDecrease}
            style={({pressed}) => [
              styles.manualStepButton,
              !canDecrease && styles.disabled,
              pressed && styles.pressed,
            ]}
            onPress={() => onUpdateQuantity(item.id, item.quantity - 1)}>
            <Text style={styles.manualStepText}>−</Text>
          </Pressable>
          <Text style={styles.manualQuantityText}>{item.quantity}</Text>
          <Pressable
            disabled={busy}
            style={({pressed}) => [
              styles.manualStepButton,
              busy && styles.disabled,
              pressed && styles.pressed,
            ]}
            onPress={() => onUpdateQuantity(item.id, item.quantity + 1)}>
            <Text style={styles.manualStepText}>+</Text>
          </Pressable>
        </View>
      </View>
    </SwipeToDeleteCard>
  );
}

function Header({title, onBack}: {title: string; onBack: () => void}) {
  return (
    <View style={styles.topBar}>
      <Pressable onPress={onBack} style={({pressed}) => [styles.back, pressed && styles.pressed]} hitSlop={10}>
        <Text style={styles.backText}>← Wróć</Text>
      </Pressable>
      <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
    </View>
  );
}

function EmptyState({title}: {title: string}) {
  return (
    <View style={styles.emptyBox}>
      <Text style={styles.emptyTitle}>{title}</Text>
    </View>
  );
}

function CreateListModal({
  visible,
  name,
  type,
  iconKey,
  iconColorKey,
  busy,
  onChangeName,
  onChangeType,
  onChangeIconKey,
  onChangeIconColorKey,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  name: string;
  type: ShoppingListType;
  iconKey: ShoppingListIconKey;
  iconColorKey: ShoppingListIconColorKey;
  busy: boolean;
  onChangeName: (name: string) => void;
  onChangeType: (type: ShoppingListType) => void;
  onChangeIconKey: (iconKey: ShoppingListIconKey) => void;
  onChangeIconColorKey: (iconColorKey: ShoppingListIconColorKey) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const selectedIcon = getShoppingListIconDefinition(iconKey);
  const selectedColor = getShoppingListIconColorDefinition(iconColorKey);
  const SelectedIcon = selectedIcon.Icon;
  const sheetTranslateY = useRef(new Animated.Value(0)).current;
  const closeWithDrag = useCallback(() => {
    Animated.timing(sheetTranslateY, {
      toValue: 420,
      duration: 160,
      useNativeDriver: true,
    }).start(({finished}) => {
      sheetTranslateY.setValue(0);
      if (finished) {
        onClose();
      }
    });
  }, [onClose, sheetTranslateY]);
  const resetSheetPosition = useCallback(() => {
    Animated.spring(sheetTranslateY, {
      toValue: 0,
      useNativeDriver: true,
      speed: 18,
      bounciness: 5,
    }).start();
  }, [sheetTranslateY]);
  const sheetDragResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_evt, gesture) =>
          Math.abs(gesture.dy) > 2 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderGrant: () => {
          sheetTranslateY.stopAnimation();
        },
        onPanResponderMove: (_evt, gesture) => {
          sheetTranslateY.setValue(Math.max(0, gesture.dy));
        },
        onPanResponderRelease: (_evt, gesture) => {
          if (gesture.dy > 80 || gesture.vy > 0.9) {
            closeWithDrag();
            return;
          }
          resetSheetPosition();
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderTerminate: resetSheetPosition,
      }),
    [closeWithDrag, resetSheetPosition, sheetTranslateY],
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <Animated.View style={[styles.createListSheet, {transform: [{translateY: sheetTranslateY}]}]}>
          <View style={styles.sheetHandleTouch} {...sheetDragResponder.panHandlers}>
            <View style={styles.sheetHandle} />
          </View>
          <Text style={styles.createTitle}>Nowa lista zakupów</Text>
          <Text style={styles.createSubtitle}>Nadaj nazwę i wybierz typ listy.</Text>
          <View style={styles.createPreview}>
            <View style={[styles.createPreviewIcon, {backgroundColor: selectedColor.background}]}>
              <SelectedIcon color={selectedColor.color} size={30} strokeWidth={2.2} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.createPreviewTitle} numberOfLines={1}>
                {name.trim() || 'Nazwa listy'}
              </Text>
              <Text style={styles.createPreviewMeta}>
                {type === 'manual' ? 'Lista zakupów' : 'Lista uzupełniania'}
              </Text>
            </View>
          </View>
          <Text style={styles.fieldLabel}>Nazwa listy</Text>
          <TextInput
            value={name}
            onChangeText={onChangeName}
            placeholder="Np. zakupy na weekend"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, styles.createInput]}
          />
          <Text style={styles.fieldLabel}>Typ listy</Text>
          <View style={styles.createTypeRow}>
            {(['manual', 'auto'] as ShoppingListType[]).map(option => {
              const active = type === option;
              const TypeIcon = option === 'manual' ? ClipboardList : RefreshCcw;
              const typeColor = option === 'manual' ? colors.accent : colors.warning;
              return (
                <Pressable
                  key={option}
                  onPress={() => onChangeType(option)}
                  style={({pressed}) => [
                    styles.createTypeOption,
                    option === 'manual' ? styles.createTypeOptionManual : styles.createTypeOptionAuto,
                    active && styles.createTypeOptionActive,
                    active && (option === 'manual' ? styles.createTypeOptionManualActive : styles.createTypeOptionAutoActive),
                    pressed && styles.pressed,
                  ]}>
                  <TypeIcon
                    color={active ? typeColor : colors.textSecondary}
                    size={20}
                    strokeWidth={2.2}
                  />
                  <Text
                    style={[
                      styles.createTypeTitle,
                      active && (option === 'manual' ? styles.createTypeTitleManualActive : styles.createTypeTitleAutoActive),
                    ]}>
                    {option === 'manual' ? 'Manualna' : 'Auto'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.iconHeaderRow}>
            <Text style={styles.iconHeaderLabel}>Ikona listy</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.colorPickerRow}
              style={styles.colorPicker}>
              {SHOPPING_LIST_ICON_COLORS.map(colorOption => {
                const active = colorOption.key === iconColorKey;
                return (
                  <Pressable
                    key={colorOption.key}
                    onPress={() => onChangeIconColorKey(colorOption.key)}
                    accessibilityLabel={`Kolor ikony: ${colorOption.label}`}
                    style={({pressed}) => [
                      styles.colorSwatchShadow,
                      active && styles.colorSwatchShadowActive,
                      pressed && styles.pressed,
                    ]}>
                    <View
                      style={[
                        styles.colorSwatch,
                      {
                        borderColor: active ? colorOption.color : colors.border,
                        backgroundColor: active ? colorOption.background : colors.surface,
                      },
                      active && styles.colorSwatchActive,
                    ]}>
                      <View style={[styles.colorSwatchInner, {backgroundColor: colorOption.color}]} />
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.iconPickerRow}>
            {SHOPPING_LIST_ICONS.map(icon => {
              const active = icon.key === iconKey;
              const Icon = icon.Icon;
              return (
                <Pressable
                  key={icon.key}
                  onPress={() => onChangeIconKey(icon.key)}
                  style={({pressed}) => [
                    styles.iconChoiceShadow,
                    active && styles.iconChoiceShadowActive,
                    pressed && styles.pressed,
                  ]}>
                  <View
                    style={[
                      styles.iconChoice,
                      active && styles.iconChoiceActive,
                      active && {
                        borderColor: selectedColor.color,
                        backgroundColor: selectedColor.background,
                      },
                    ]}>
                    <Icon
                      color={active ? selectedColor.color : colors.textSecondary}
                      size={27}
                      strokeWidth={2.1}
                    />
                    <Text
                      style={[
                        styles.iconChoiceLabel,
                        active && styles.iconChoiceLabelActive,
                        active && {color: selectedColor.color},
                      ]}
                      numberOfLines={1}>
                      {icon.label}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable
            disabled={busy || name.trim().length === 0}
            onPress={onSubmit}
            style={({pressed}) => [
              styles.createSubmitButton,
              (busy || name.trim().length === 0) && styles.disabled,
              pressed && styles.pressed,
            ]}>
            <Text style={styles.createSubmitButtonText}>Utwórz listę</Text>
          </Pressable>
          <Pressable onPress={onClose} disabled={busy} style={styles.createCancelButton}>
            <Text style={styles.createCancelText}>Anuluj</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

function AddItemModal({
  visible,
  quantity,
  catalogQuery,
  catalogResults,
  selectedCatalog,
  busy,
  onChangeQuantity,
  onChangeCatalogQuery,
  onSelectCatalog,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  quantity: string;
  catalogQuery: string;
  catalogResults: CatalogProduct[];
  selectedCatalog: CatalogProduct | null;
  busy: boolean;
  onChangeQuantity: (quantity: string) => void;
  onChangeCatalogQuery: (query: string) => void;
  onSelectCatalog: (product: CatalogProduct) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const quantityIsValid = parseQuantityInput(quantity) != null;
  const productName = catalogQuery.trim();
  const canSubmit = quantityIsValid && (selectedCatalog != null || productName.length > 0);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>Dodaj produkt</Text>
          <TextInput
            value={catalogQuery}
            onChangeText={onChangeCatalogQuery}
            placeholder="Wpisz lub wyszukaj produkt"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          {catalogResults.length > 0 ? (
            <ScrollView style={styles.catalogResults} keyboardShouldPersistTaps="handled">
              {catalogResults.map(product => {
                const active = selectedCatalog?.id === product.id;
                return (
                  <Pressable
                    key={product.id}
                    onPress={() => onSelectCatalog(product)}
                    style={({pressed}) => [styles.catalogRow, active && styles.catalogRowActive, pressed && styles.pressed]}>
                    <Text style={styles.catalogName}>{product.name}</Text>
                    <Text style={styles.catalogKind}>
                      {product.kind === 'specific' ? 'Produkt z EAN' : 'Produkt katalogowy'}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}
          <TextInput
            value={quantity}
            onChangeText={onChangeQuantity}
            placeholder="Ilość"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, !quantityIsValid && styles.inputError]}
          />
          {!quantityIsValid ? (
            <Text style={styles.fieldError}>Ilość musi być liczbą większą od 0</Text>
          ) : null}
          <ModalActions
            busy={busy}
            submitDisabled={!canSubmit}
            onClose={onClose}
            onSubmit={onSubmit}
            submitLabel={selectedCatalog ? 'Dodaj z katalogu' : 'Dodaj'}
          />
        </View>
      </View>
    </Modal>
  );
}

function CatalogLinksModal({
  item,
  query,
  results,
  busy,
  onChangeQuery,
  onLink,
  onUnlink,
  onClose,
}: {
  item: AutoShoppingListItemState | null;
  query: string;
  results: CatalogProduct[];
  busy: boolean;
  onChangeQuery: (query: string) => void;
  onLink: (product: CatalogProduct) => void;
  onUnlink: (catalogProductId: string) => void;
  onClose: () => void;
}) {
  const linkedIds = new Set(item?.linkedCatalogProducts.map(product => product.id) ?? []);
  const availableResults = results.filter(product => !linkedIds.has(product.id));

  return (
    <Modal visible={item != null} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>Powiązania katalogu</Text>
          <Text style={styles.confirmText} numberOfLines={2}>{item?.label}</Text>

          <Text style={styles.modalSectionTitle}>Powiązane produkty</Text>
          {item && item.linkedCatalogProducts.length > 0 ? (
            item.linkedCatalogProducts.map(product => (
              <View key={product.id} style={styles.linkedCatalogRow}>
                <View style={styles.linkedCatalogText}>
                  <Text style={styles.catalogName} numberOfLines={1}>{product.name}</Text>
                  <Text style={styles.catalogKind}>
                    {product.kind === 'specific' ? 'Produkt z EAN' : 'Produkt katalogowy'}
                  </Text>
                </View>
                <Pressable
                  disabled={busy}
                  onPress={() => onUnlink(product.id)}
                  style={({pressed}) => [styles.smallDangerButton, busy && styles.disabled, pressed && styles.pressed]}>
                  <Text style={styles.smallDangerButtonText}>Usuń</Text>
                </Pressable>
              </View>
            ))
          ) : (
            <Text style={styles.catalogEmptyText}>Brak powiązań</Text>
          )}

          <TextInput
            value={query}
            onChangeText={onChangeQuery}
            placeholder="Szukaj produktu z katalogu"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          {availableResults.length > 0 ? (
            <ScrollView style={styles.catalogResults} keyboardShouldPersistTaps="handled">
              {availableResults.map(product => (
                <Pressable
                  key={product.id}
                  disabled={busy}
                  onPress={() => onLink(product)}
                  style={({pressed}) => [styles.catalogRow, busy && styles.disabled, pressed && styles.pressed]}>
                  <Text style={styles.catalogName}>{product.name}</Text>
                  <Text style={styles.catalogKind}>
                    {product.kind === 'specific' ? 'Produkt z EAN' : 'Produkt katalogowy'}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          <View style={styles.modalActions}>
            <Pressable onPress={onClose} style={({pressed}) => [styles.secondaryButton, pressed && styles.pressed]}>
              <Text style={styles.secondaryButtonText}>Zamknij</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function DeleteListModal({
  list,
  busy,
  onClose,
  onSubmit,
}: {
  list: ShoppingListSummary | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Modal visible={list != null} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>Usunąć listę?</Text>
          <Text style={styles.confirmText} numberOfLines={3}>
            {list?.name}
          </Text>
          <View style={styles.modalActions}>
            <Pressable onPress={onClose} style={({pressed}) => [styles.secondaryButton, pressed && styles.pressed]}>
              <Text style={styles.secondaryButtonText}>Anuluj</Text>
            </Pressable>
            <Pressable
              disabled={busy}
              onPress={onSubmit}
              style={({pressed}) => [styles.dangerButton, busy && styles.disabled, pressed && styles.pressed]}>
              <Text style={styles.dangerButtonText}>Usuń</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ModalActions({
  busy,
  submitDisabled,
  submitLabel,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  submitDisabled?: boolean;
  submitLabel: string;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <View style={styles.modalActions}>
      <Pressable onPress={onClose} style={({pressed}) => [styles.secondaryButton, pressed && styles.pressed]}>
        <Text style={styles.secondaryButtonText}>Anuluj</Text>
      </Pressable>
      <Pressable
        disabled={busy || submitDisabled}
        onPress={onSubmit}
        style={({pressed}) => [
          styles.primaryButton,
          (busy || submitDisabled) && styles.disabled,
          pressed && styles.pressed,
        ]}>
        <Text style={styles.primaryButtonText}>{submitLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  topBar: {
    minHeight: 44,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  back: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  backText: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '700',
  },
  headerTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'right',
    marginLeft: 12,
  },
  listsHero: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
  },
  screenTitle: {
    color: colors.textPrimary,
    fontSize: 30,
    fontWeight: '900',
    marginBottom: 16,
  },
  searchCreateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  searchBox: {
    flex: 1,
    minHeight: 52,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    shadowColor: colors.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 3},
    elevation: 2,
  },
  searchIcon: {
    color: colors.textMuted,
    fontSize: 25,
    lineHeight: 28,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 16,
    paddingVertical: 0,
  },
  newListButton: {
    minHeight: 52,
    minWidth: 92,
    borderRadius: 8,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    shadowColor: colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 5},
    elevation: 3,
  },
  newListButtonText: {
    color: colors.successText,
    fontSize: 16,
    fontWeight: '900',
  },
  filterBar: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
    flexDirection: 'row',
    padding: 5,
    gap: 4,
    shadowColor: colors.shadow,
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 3},
    elevation: 1,
  },
  filterSegment: {
    flex: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterSegmentActive: {
    backgroundColor: colors.success,
  },
  filterSegmentText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  filterSegmentTextActive: {
    color: colors.successText,
  },
  replenishmentTile: {
    marginBottom: 12,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    minHeight: 126,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    shadowColor: colors.shadow,
    shadowOpacity: 0.09,
    shadowRadius: 14,
    shadowOffset: {width: 0, height: 7},
    elevation: 4,
  },
  replenishmentIcon: {
    width: 86,
    height: 86,
    borderRadius: 8,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  replenishmentText: {
    flex: 1,
    minWidth: 0,
  },
  titleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  suggestionTitle: {
    color: colors.textPrimary,
    fontSize: 23,
    fontWeight: '900',
  },
  suggestionMeta: {
    color: colors.textSecondary,
    marginTop: 8,
    fontSize: 15,
  },
  suggestionBadge: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  suggestionBadgeText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '900',
  },
  suggestionArrow: {
    color: colors.accent,
    fontSize: 30,
    fontWeight: '400',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 94,
  },
  card: {
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 6},
    elevation: 3,
  },
  listCard: {
    minHeight: 74,
    marginBottom: 0,
  },
  cardPressed: {
    opacity: 0.86,
  },
  cardDragging: {
    borderColor: colors.success,
    shadowOpacity: 0.14,
    elevation: 5,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  listIconBubble: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '900',
  },
  cardMeta: {
    color: colors.textSecondary,
    marginTop: 3,
    fontSize: 13,
  },
  listTypePill: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  listTypePillManual: {
    borderColor: colors.accentSoft,
    backgroundColor: colors.accentSoft,
  },
  listTypePillAuto: {
    borderColor: colors.warningSoft,
    backgroundColor: colors.warningSoft,
  },
  listTypePillText: {
    fontSize: 11,
    fontWeight: '900',
  },
  listTypePillTextManual: {
    color: colors.accent,
  },
  listTypePillTextAuto: {
    color: colors.warning,
  },
  listTrailing: {
    minHeight: 50,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  listTrailingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    borderRadius: 8,
    backgroundColor: colors.success,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  badgeMuted: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeText: {
    color: colors.successText,
    fontWeight: '900',
    fontSize: 11,
  },
  badgeMutedText: {
    color: colors.textSecondary,
  },
  detailToolbar: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  listBadge: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  listBadgeText: {
    color: colors.textSecondary,
    fontWeight: '700',
  },
  manualDetailsHero: {
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 14,
  },
  suggestionsHero: {
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 14,
  },
  autoDetailsHero: {
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 14,
  },
  detailsTopRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  manualBackButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
  },
  manualBackText: {
    color: colors.accent,
    fontSize: 17,
    fontWeight: '800',
  },
  manualDetailsTitle: {
    color: colors.textPrimary,
    fontSize: 38,
    fontWeight: '900',
  },
  manualTypeBadge: {
    borderRadius: 8,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  manualTypeBadgeText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '900',
  },
  autoBadgeRow: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  autoTypeBadge: {
    borderRadius: 8,
    backgroundColor: colors.warningSoft,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  autoTypeBadgeText: {
    color: colors.warning,
    fontSize: 12,
    fontWeight: '900',
  },
  autoLockBadge: {
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  autoLockBadgeText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '900',
  },
  manualDetailsMeta: {
    color: colors.textSecondary,
    fontSize: 15,
    marginTop: 8,
  },
  manualProgressTrack: {
    height: 9,
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 16,
    marginBottom: 16,
  },
  manualProgressFill: {
    height: '100%',
    borderRadius: 8,
    backgroundColor: colors.success,
  },
  manualSearchBox: {
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
  manualSearchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 16,
    paddingVertical: 0,
  },
  autoStatusRow: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  autoStatusText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '700',
  },
  manualItemsContent: {
    paddingHorizontal: 16,
    paddingBottom: 112,
  },
  suggestionsContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  manualItemCard: {
    minHeight: 78,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 6},
    elevation: 3,
  },
  manualItemCardPurchased: {
    borderColor: colors.accentSoft,
    backgroundColor: colors.surface,
  },
  manualItemCardDragging: {
    borderColor: colors.success,
    shadowOpacity: 0.14,
    elevation: 5,
  },
  autoItemCard: {
    minHeight: 78,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 6},
    elevation: 3,
  },
  autoItemIcon: {
    width: 46,
    height: 46,
    borderRadius: 999,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  autoItemText: {
    flex: 1,
    minWidth: 0,
  },
  suggestionItemCard: {
    minHeight: 92,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 6},
    elevation: 3,
    marginBottom: 12,
  },
  suggestionItemText: {
    flex: 1,
    minWidth: 0,
  },
  suggestionSourceText: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 8,
  },
  suggestionMissingPill: {
    minHeight: 36,
    borderRadius: 8,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  suggestionMissingText: {
    color: colors.warning,
    fontSize: 12,
    fontWeight: '900',
  },
  manualItemStatusBar: {
    position: 'absolute',
    left: 0,
    top: 10,
    bottom: 10,
    width: 4,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    backgroundColor: colors.success,
  },
  manualItemIcon: {
    width: 46,
    height: 46,
    borderRadius: 999,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualItemIconPurchased: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentSoft,
  },
  manualItemText: {
    flex: 1,
    minWidth: 0,
  },
  manualItemTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '900',
  },
  manualItemTitlePurchased: {
    color: colors.textSecondary,
  },
  manualItemMeta: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 4,
  },
  itemCatalogLink: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    paddingVertical: 2,
  },
  itemCatalogLinkText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '800',
  },
  manualItemControls: {
    alignItems: 'flex-end',
  },
  manualQuantityStepper: {
    height: 38,
    minWidth: 98,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: colors.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 3},
    elevation: 1,
  },
  manualStepButton: {
    width: 32,
    height: 36,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSubtle,
  },
  manualStepText: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '900',
  },
  manualQuantityText: {
    minWidth: 34,
    textAlign: 'center',
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '900',
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    gap: 10,
  },
  manualBottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    gap: 10,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: {width: 0, height: -5},
    elevation: 10,
  },
  manualAddButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.success,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
    shadowColor: colors.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 3},
    elevation: 1,
  },
  manualAddButtonText: {
    color: colors.success,
    fontSize: 16,
    fontWeight: '900',
  },
  manualFinalizeButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 8,
    backgroundColor: colors.success,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
    shadowColor: colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 5},
    elevation: 4,
  },
  manualFinalizeButtonText: {
    color: colors.successText,
    fontSize: 16,
    fontWeight: '900',
  },
  primaryButton: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: colors.success,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: colors.successText,
    fontSize: 14,
    fontWeight: '900',
  },
  inlineButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  mergeButton: {
    flex: 0,
    minHeight: 46,
    alignSelf: 'stretch',
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: colors.surfaceSubtle,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '900',
  },
  dangerButton: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: colors.danger,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerButtonText: {
    color: colors.successText,
    fontSize: 14,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.78,
  },
  disabled: {
    opacity: 0.45,
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyBox: {
    alignItems: 'center',
    padding: 28,
  },
  emptyTitle: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '700',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mergeBar: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 12,
  },
  mergeLabel: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '900',
  },
  targetRow: {
    gap: 10,
    paddingRight: 16,
  },
  targetChip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 44,
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  targetChipActive: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  targetChipText: {
    color: colors.textSecondary,
    fontWeight: '900',
    fontSize: 14,
  },
  targetChipTextActive: {
    color: colors.successText,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.modalBackdrop,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    padding: 16,
    borderTopWidth: 1,
    borderColor: colors.border,
    maxHeight: '88%',
  },
  createListSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderColor: colors.border,
    maxHeight: '90%',
  },
  sheetHandleTouch: {
    alignSelf: 'center',
    width: '100%',
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  sheetHandle: {
    width: 58,
    height: 6,
    borderRadius: 8,
    backgroundColor: colors.border,
  },
  createTitle: {
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: '900',
    marginBottom: 6,
  },
  createSubtitle: {
    color: colors.textSecondary,
    fontSize: 15,
    marginBottom: 18,
  },
  createPreview: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 12,
    marginBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: colors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 4},
    elevation: 2,
  },
  createPreviewIcon: {
    width: 62,
    height: 62,
    borderRadius: 8,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createPreviewTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '900',
  },
  createPreviewMeta: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 4,
  },
  fieldLabel: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 8,
  },
  iconHeaderRow: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  iconHeaderLabel: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '900',
  },
  colorPicker: {
    flexShrink: 1,
    maxWidth: 210,
  },
  colorPickerRow: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    paddingRight: 2,
  },
  colorSwatchShadow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: {width: 0, height: 3},
    elevation: 2,
  },
  colorSwatchShadowActive: {
    shadowOpacity: 0.08,
    elevation: 3,
  },
  colorSwatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorSwatchActive: {
    borderWidth: 2,
  },
  colorSwatchInner: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  createTypeRow: {
    minHeight: 50,
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: 16,
    padding: 2,
    gap: 4,
    shadowColor: colors.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 3},
    elevation: 1,
  },
  createTypeOption: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 10,
  },
  createTypeOptionManual: {
    backgroundColor: colors.surface,
  },
  createTypeOptionAuto: {
    backgroundColor: colors.surface,
  },
  createTypeOptionActive: {
    borderWidth: 2,
    margin: -3,
    zIndex: 2,
  },
  createTypeOptionManualActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  createTypeOptionAutoActive: {
    borderColor: colors.warning,
    backgroundColor: colors.warningSoft,
  },
  createTypeTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '900',
  },
  createTypeTitleManualActive: {
    color: colors.accent,
  },
  createTypeTitleAutoActive: {
    color: colors.warning,
  },
  iconPickerRow: {
    gap: 10,
    paddingTop: 4,
    paddingBottom: 8,
    paddingRight: 16,
  },
  iconChoiceShadow: {
    width: 82,
    minHeight: 88,
    borderRadius: 8,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 5},
    elevation: 2,
  },
  iconChoiceShadowActive: {
    shadowOpacity: 0.09,
    elevation: 3,
  },
  iconChoice: {
    width: 82,
    minHeight: 88,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    gap: 8,
  },
  iconChoiceActive: {
    borderColor: colors.success,
    backgroundColor: colors.accentSoft,
  },
  iconChoiceLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
    maxWidth: '100%',
  },
  iconChoiceLabelActive: {
    color: colors.accent,
  },
  createSubmitButton: {
    borderRadius: 8,
    backgroundColor: colors.success,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  createSubmitButtonText: {
    color: colors.successText,
    fontSize: 16,
    fontWeight: '900',
  },
  createCancelButton: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  createCancelText: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '900',
  },
  modalTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 12,
  },
  confirmText: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 14,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 10,
  },
  createInput: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 3},
    elevation: 1,
  },
  inputError: {
    borderColor: colors.danger,
  },
  fieldError: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '700',
    marginTop: -4,
    marginBottom: 10,
  },
  modalSectionTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 8,
  },
  linkedCatalogRow: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 10,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  linkedCatalogText: {
    flex: 1,
    minWidth: 0,
  },
  catalogEmptyText: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: 12,
  },
  smallDangerButton: {
    minHeight: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  smallDangerButtonText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '900',
  },
  catalogResults: {
    maxHeight: 180,
    marginBottom: 10,
  },
  catalogRow: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    marginBottom: 8,
    backgroundColor: colors.surface,
  },
  catalogRowActive: {
    borderColor: colors.success,
  },
  catalogName: {
    color: colors.textPrimary,
    fontWeight: '800',
  },
  catalogKind: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
});
