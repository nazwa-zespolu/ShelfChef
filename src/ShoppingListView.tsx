import React, {useCallback, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Animated,
  Alert,
  BackHandler,
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
import {
  AutoShoppingListItemState,
  CatalogProduct,
  ShoppingItemStatus,
  ShoppingListSummary,
  ShoppingListType,
  ShoppingSuggestion,
} from './domain/types';
import {ShoppingList} from './app/ShoppingList';
import {ProductRepository} from './infrastructure/ProductRepository';
import {ShoppingListRepository} from './infrastructure/ShoppingListRepository';
import {SwipeToDeleteCard} from './components/SwipeToDeleteCard';
import {colors} from './theme/colors';

type ShoppingListViewProps = {
  onRequestClose: () => void;
  onInventoryChanged?: () => void;
};

type ScreenMode = 'lists' | 'suggestions' | 'details';
type AddMode = 'text' | 'catalog' | 'generic';

const shoppingRepository = new ShoppingListRepository();
const productRepository = new ProductRepository();
const shoppingList = new ShoppingList(shoppingRepository, productRepository);

function statusLabel(status: ShoppingItemStatus) {
  switch (status) {
    case 'planned':
      return 'Do kupienia';
    case 'purchased':
      return 'Kupione';
    case 'unavailable':
      return 'Nie było';
    case 'stored':
      return 'W zapasach';
  }
}

function listTypeLabel(type: ShoppingListType) {
  return type === 'auto' ? 'Lista uzupełniania' : 'Lista zakupów';
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
  const [addOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>('text');
  const [addLabel, setAddLabel] = useState('');
  const [addQuantity, setAddQuantity] = useState('1');
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogResults, setCatalogResults] = useState<CatalogProduct[]>([]);
  const [selectedCatalog, setSelectedCatalog] = useState<CatalogProduct | null>(null);
  const [targetListId, setTargetListId] = useState<string | null>(null);
  const [pendingDeleteList, setPendingDeleteList] = useState<ShoppingListSummary | null>(null);

  const manualLists = useMemo(() => lists.filter(list => list.type === 'manual'), [lists]);

  const loadLists = useCallback(async () => {
    setLoading(true);
    try {
      const [nextLists, nextSuggestions] = await Promise.all([
        shoppingRepository.getLists(),
        shoppingList.generateReplenishmentSuggestions(),
      ]);
      setLists(nextLists);
      setSuggestions(nextSuggestions);
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
  }, [addOpen, createOpen, mode, onRequestClose, pendingDeleteList]);

  React.useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', goBackOneLevel);
    return () => subscription.remove();
  }, [goBackOneLevel]);

  React.useEffect(() => {
    if (mode === 'lists') {
      loadLists().catch(() => setLoading(false));
    }
  }, [loadLists, mode]);

  const openList = useCallback(
    (list: ShoppingListSummary) => {
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
      const created = await shoppingList.createList(name, createType);
      setCreateName('');
      setCreateType('manual');
      setCreateOpen(false);
      await loadLists();
      openList(created);
    } finally {
      setBusy(false);
    }
  }, [createName, createType, loadLists, openList]);

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
    setAddMode('text');
    setAddLabel('');
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

  const addItem = useCallback(async () => {
    if (!selectedList) {
      return;
    }
    const quantity = parseQuantityInput(addQuantity);
    if (quantity == null) {
      return;
    }
    const textLabel = addLabel.trim();
    const genericName = catalogQuery.trim();
    if (addMode === 'catalog' && !selectedCatalog) {
      return;
    }
    if (addMode === 'text' && !textLabel) {
      return;
    }
    if (addMode === 'generic' && !genericName) {
      return;
    }

    setBusy(true);
    try {
      if (addMode === 'catalog' && selectedCatalog) {
        await shoppingList.addItem(selectedList.id, {
          catalogProductId: selectedCatalog.id,
          label: selectedCatalog.name,
          quantity,
        });
      } else if (addMode === 'generic') {
        const generic = await shoppingRepository.createGenericCatalogProduct(genericName);
        await shoppingList.addItem(selectedList.id, {
          catalogProductId: generic.id,
          label: generic.name,
          quantity,
        });
      } else {
        await shoppingList.addItem(selectedList.id, {
          label: textLabel,
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
  }, [addLabel, addMode, addQuantity, catalogQuery, loadSelectedList, selectedCatalog, selectedList]);

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
      onOpen={openList}
      onMove={moveList}
      onRequestDelete={setPendingDeleteList}
    />
  );

  const renderItem = ({item}: {item: AutoShoppingListItemState}) => {
    const shownStatus = selectedList?.type === 'auto' && !selectedList.isLocked
      ? item.effectiveStatus
      : item.status;
    return (
      <SwipeToDeleteCard
        borderRadius={8}
        allowRightDelete={false}
        onDelete={() => { deleteItem(item.id).catch(() => {}); }}
        onSwipeRight={
          selectedList?.type === 'manual'
            ? () => { updateStatus(item.id, 'purchased').catch(() => {}); }
            : undefined
        }>
        <View style={[styles.itemCard, styles.swipeItemCard]}>
        <View style={styles.rowBetween}>
          <View style={styles.rowText}>
            <Text style={styles.itemTitle} numberOfLines={2}>{item.label}</Text>
            <Text style={styles.itemMeta}>
              {statusLabel(shownStatus)} · ilość {item.quantity}
              {selectedList?.type === 'auto'
                ? ` · masz ${item.currentQuantity}`
                : ''}
            </Text>
          </View>
          <View style={styles.quantityStepper}>
            <Pressable
              style={({pressed}) => [styles.stepButton, pressed && styles.pressed]}
              onPress={() => updateQuantity(item.id, item.quantity - 1)}>
              <Text style={styles.stepText}>−</Text>
            </Pressable>
            <Text style={styles.quantityText}>{item.quantity}</Text>
            <Pressable
              style={({pressed}) => [styles.stepButton, pressed && styles.pressed]}
              onPress={() => updateQuantity(item.id, item.quantity + 1)}>
              <Text style={styles.stepText}>+</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.actionRow}>
          <ActionButton label="Kupione" onPress={() => updateStatus(item.id, 'purchased')} />
          <ActionButton label="Nie było" onPress={() => updateStatus(item.id, 'unavailable')} />
          <ActionButton label="Cofnij" onPress={() => updateStatus(item.id, 'planned')} />
        </View>
        </View>
      </SwipeToDeleteCard>
    );
  };

  const renderSuggestions = () => (
    <View style={styles.content}>
      <Header title="Do uzupełnienia" onBack={goBackOneLevel} />
      <View style={styles.mergeBar}>
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
          <Text style={styles.primaryButtonText}>Dodaj do listy</Text>
        </Pressable>
      </View>
      <FlatList
        data={suggestions}
        keyExtractor={item => item.catalogProductId}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={openSuggestions} tintColor={colors.success} />}
        contentContainerStyle={[styles.listContent, suggestions.length === 0 && styles.emptyContent]}
        renderItem={({item}) => (
          <View style={styles.itemCard}>
            <View style={styles.rowBetween}>
              <View style={styles.rowText}>
                <Text style={styles.itemTitle}>{item.name}</Text>
                <Text style={styles.itemMeta}>{item.reason} · brakuje {item.missingQuantity}</Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.priority === 'out' ? 'Brak' : 'Mało'}</Text>
              </View>
            </View>
            <Text style={styles.sourceText} numberOfLines={1}>
              {item.sourceAutoListNames.join(', ')}
            </Text>
          </View>
        )}
        ListEmptyComponent={<EmptyState title="Brak sugestii" />}
      />
    </View>
  );

  const renderDetails = () => {
    if (!selectedList) {
      return null;
    }
    const purchasedCount = items.filter(item => item.status === 'purchased').length;
    return (
      <View style={styles.content}>
        <Header title={selectedList.name} onBack={goBackOneLevel} />
        <View style={styles.detailToolbar}>
          <View style={styles.listBadge}>
            <Text style={styles.listBadgeText}>{listTypeLabel(selectedList.type)}</Text>
          </View>
          {selectedList.type === 'auto' ? (
            <Pressable
              onPress={toggleLock}
              disabled={busy}
              style={({pressed}) => [styles.secondaryButton, pressed && styles.pressed]}>
              <Text style={styles.secondaryButtonText}>
                {selectedList.isLocked ? 'Odblokuj' : 'Zablokuj'}
              </Text>
            </Pressable>
          ) : null}
        </View>
        <FlatList
          data={items}
          keyExtractor={item => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refreshCurrent} tintColor={colors.success} />}
          contentContainerStyle={[styles.listContent, items.length === 0 && styles.emptyContent]}
          renderItem={renderItem}
          ListEmptyComponent={<EmptyState title="Pusta lista" />}
        />
        <View style={[styles.bottomBar, {paddingBottom: insets.bottom + 10}]}>
          <Pressable
            onPress={openAddItem}
            style={({pressed}) => [styles.primaryButton, pressed && styles.pressed]}>
            <Text style={styles.primaryButtonText}>Dodaj</Text>
          </Pressable>
          <Pressable
            disabled={purchasedCount === 0 || busy}
            onPress={() => { completePurchase().catch(() => {}); }}
            style={({pressed}) => [
              styles.secondaryButton,
              (purchasedCount === 0 || busy) && styles.disabled,
              pressed && styles.pressed,
            ]}>
            <Text style={styles.secondaryButtonText}>Finalizuj</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const renderLists = () => (
    <View style={styles.content}>
      <View style={styles.topBar}>
        <Pressable onPress={goBackOneLevel} style={({pressed}) => [styles.back, pressed && styles.pressed]} hitSlop={10}>
          <Text style={styles.backText}>← Wróć</Text>
        </Pressable>
        <Pressable onPress={() => setCreateOpen(true)} style={({pressed}) => [styles.headerButton, pressed && styles.pressed]}>
          <Text style={styles.headerButtonText}>Nowa</Text>
        </Pressable>
      </View>
      <Text style={styles.screenTitle}>Listy zakupów</Text>
      <Pressable
        onPress={openSuggestions}
        style={({pressed}) => [styles.suggestionTile, pressed && styles.cardPressed]}>
        <View>
          <Text style={styles.suggestionTitle}>Do uzupełnienia</Text>
          <Text style={styles.suggestionMeta}>{suggestions.length} sugestii</Text>
        </View>
        <Text style={styles.suggestionArrow}>›</Text>
      </Pressable>
      <FlatList
        data={lists}
        keyExtractor={item => item.id}
        renderItem={renderListRow}
        contentContainerStyle={[styles.listContent, lists.length === 0 && styles.emptyContent]}
        ListEmptyComponent={<EmptyState title="Brak list" />}
      />
    </View>
  );

  return (
    <View style={[styles.root, {paddingTop: insets.top + 8}]}>
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
        busy={busy}
        onChangeName={setCreateName}
        onChangeType={setCreateType}
        onClose={() => setCreateOpen(false)}
        onSubmit={createList}
      />
      <AddItemModal
        visible={addOpen}
        mode={addMode}
        label={addLabel}
        quantity={addQuantity}
        catalogQuery={catalogQuery}
        catalogResults={catalogResults}
        selectedCatalog={selectedCatalog}
        busy={busy}
        onChangeMode={setAddMode}
        onChangeLabel={setAddLabel}
        onChangeQuantity={setAddQuantity}
        onChangeCatalogQuery={query => searchCatalog(query).catch(() => {})}
        onSelectCatalog={product => {
          setSelectedCatalog(product);
          setCatalogQuery(product.name);
        }}
        onClose={() => setAddOpen(false)}
        onSubmit={addItem}
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
  onOpen,
  onMove,
  onRequestDelete,
}: {
  item: ShoppingListSummary;
  onOpen: (item: ShoppingListSummary) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onRequestDelete: (item: ShoppingListSummary) => void;
}) {
  const translateY = useRef(new Animated.Value(0)).current;
  const dragActive = useRef(false);
  const dragTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const movedAt = useRef(0);
  const [dragging, setDragging] = useState(false);

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
            <View style={styles.dragHandle} {...dragResponder.panHandlers}>
              <Text style={styles.dragHandleText}>≡</Text>
            </View>
            <View style={styles.rowText}>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.cardMeta}>{listTypeLabel(item.type)}</Text>
            </View>
            {item.type === 'auto' ? (
              <View style={[styles.badge, item.isLocked && styles.badgeMuted]}>
                <Text style={styles.badgeText}>{item.isLocked ? 'Lock' : 'Auto'}</Text>
              </View>
            ) : null}
          </View>
        </Pressable>
      </Animated.View>
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

function ActionButton({
  label,
  danger,
  onPress,
}: {
  label: string;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({pressed}) => [
        styles.actionButton,
        danger && styles.actionButtonDanger,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.actionButtonText, danger && styles.actionButtonTextDanger]}>
        {label}
      </Text>
    </Pressable>
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
  busy,
  onChangeName,
  onChangeType,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  name: string;
  type: ShoppingListType;
  busy: boolean;
  onChangeName: (name: string) => void;
  onChangeType: (type: ShoppingListType) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>Nowa lista</Text>
          <TextInput
            value={name}
            onChangeText={onChangeName}
            placeholder="Nazwa"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          <View style={styles.segmentRow}>
            {(['manual', 'auto'] as ShoppingListType[]).map(option => {
              const active = type === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => onChangeType(option)}
                  style={({pressed}) => [styles.segment, active && styles.segmentActive, pressed && styles.pressed]}>
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                    {option === 'manual' ? 'Manual' : 'Auto'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <ModalActions busy={busy} onClose={onClose} onSubmit={onSubmit} submitLabel="Utwórz" />
        </View>
      </View>
    </Modal>
  );
}

function AddItemModal({
  visible,
  mode,
  label,
  quantity,
  catalogQuery,
  catalogResults,
  selectedCatalog,
  busy,
  onChangeMode,
  onChangeLabel,
  onChangeQuantity,
  onChangeCatalogQuery,
  onSelectCatalog,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  mode: AddMode;
  label: string;
  quantity: string;
  catalogQuery: string;
  catalogResults: CatalogProduct[];
  selectedCatalog: CatalogProduct | null;
  busy: boolean;
  onChangeMode: (mode: AddMode) => void;
  onChangeLabel: (label: string) => void;
  onChangeQuantity: (quantity: string) => void;
  onChangeCatalogQuery: (query: string) => void;
  onSelectCatalog: (product: CatalogProduct) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const quantityIsValid = parseQuantityInput(quantity) != null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>Dodaj produkt</Text>
          <View style={styles.segmentRow}>
            {(['text', 'catalog', 'generic'] as AddMode[]).map(option => {
              const active = mode === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => onChangeMode(option)}
                  style={({pressed}) => [styles.segment, active && styles.segmentActive, pressed && styles.pressed]}>
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                    {option === 'text' ? 'Tekst' : option === 'catalog' ? 'Katalog' : 'Ogólny'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {mode === 'text' ? (
            <TextInput
              value={label}
              onChangeText={onChangeLabel}
              placeholder="Produkt"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
          ) : (
            <>
              <TextInput
                value={catalogQuery}
                onChangeText={onChangeCatalogQuery}
                placeholder={mode === 'generic' ? 'Nazwa ogólna' : 'Szukaj w katalogu'}
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />
              {mode === 'catalog' ? (
                <ScrollView style={styles.catalogResults} keyboardShouldPersistTaps="handled">
                  {catalogResults.map(product => {
                    const active = selectedCatalog?.id === product.id;
                    return (
                      <Pressable
                        key={product.id}
                        onPress={() => onSelectCatalog(product)}
                        style={({pressed}) => [styles.catalogRow, active && styles.catalogRowActive, pressed && styles.pressed]}>
                        <Text style={styles.catalogName}>{product.name}</Text>
                        <Text style={styles.catalogKind}>{product.kind === 'specific' ? 'EAN' : 'Ogólny'}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : null}
            </>
          )}
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
            submitDisabled={!quantityIsValid}
            onClose={onClose}
            onSubmit={onSubmit}
            submitLabel="Dodaj"
          />
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
    backgroundColor: colors.black,
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
    color: colors.successAccent,
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
  headerButton: {
    backgroundColor: colors.surfaceSoft,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  headerButtonText: {
    color: colors.textPrimary,
    fontWeight: '800',
  },
  screenTitle: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 12,
  },
  suggestionTile: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 8,
    backgroundColor: colors.surfaceMid,
    borderWidth: 1,
    borderColor: colors.success,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  suggestionTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
  },
  suggestionMeta: {
    color: colors.textSecondary,
    marginTop: 3,
    fontSize: 13,
  },
  suggestionArrow: {
    color: colors.successAccent,
    fontSize: 30,
    fontWeight: '400',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 94,
  },
  card: {
    borderRadius: 8,
    backgroundColor: colors.surfaceMid,
    borderWidth: 1,
    borderColor: colors.borderDark,
    padding: 14,
    marginBottom: 10,
  },
  listCard: {
    minHeight: 72,
    marginBottom: 0,
  },
  cardPressed: {
    opacity: 0.86,
  },
  cardDragging: {
    borderColor: colors.success,
  },
  dragHandle: {
    width: 28,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dragHandleText: {
    color: colors.textMuted,
    fontSize: 23,
    fontWeight: '900',
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
  cardTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  cardMeta: {
    color: colors.textMuted,
    marginTop: 3,
    fontSize: 12,
  },
  badge: {
    borderRadius: 8,
    backgroundColor: colors.success,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  badgeMuted: {
    backgroundColor: colors.surfaceSoft,
  },
  badgeText: {
    color: colors.successText,
    fontWeight: '900',
    fontSize: 11,
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
    borderColor: colors.borderDark,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  listBadgeText: {
    color: colors.textSecondary,
    fontWeight: '700',
  },
  itemCard: {
    borderRadius: 8,
    backgroundColor: colors.surfaceMid,
    borderWidth: 1,
    borderColor: colors.borderDark,
    padding: 12,
    marginBottom: 10,
  },
  swipeItemCard: {
    marginBottom: 0,
  },
  itemTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  itemMeta: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
  sourceText: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 10,
  },
  quantityStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderDark,
  },
  stepButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSoft,
  },
  stepText: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '900',
  },
  quantityText: {
    minWidth: 34,
    textAlign: 'center',
    color: colors.textPrimary,
    fontWeight: '800',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  actionButton: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: colors.surfaceSoft,
  },
  actionButtonDanger: {
    backgroundColor: '#3a2428',
  },
  actionButtonText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  actionButtonTextDanger: {
    color: '#ff9c9c',
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: colors.black,
    borderTopWidth: 1,
    borderTopColor: colors.borderDark,
    flexDirection: 'row',
    gap: 10,
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
  mergeButton: {
    flex: 0,
    minHeight: 46,
    alignSelf: 'stretch',
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: colors.surfaceSoft,
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
    backgroundColor: '#7d252d',
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerButtonText: {
    color: '#ffd7d7',
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
    paddingBottom: 10,
    gap: 10,
  },
  targetRow: {
    gap: 8,
    paddingRight: 16,
  },
  targetChip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderDark,
    backgroundColor: colors.surfaceMid,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  targetChipActive: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  targetChipText: {
    color: colors.textSecondary,
    fontWeight: '800',
    fontSize: 12,
  },
  targetChipTextActive: {
    color: colors.successText,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.surfaceDark,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    padding: 16,
    borderTopWidth: 1,
    borderColor: colors.borderDark,
    maxHeight: '88%',
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
    backgroundColor: colors.surfaceMid,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderDark,
    color: colors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 10,
  },
  inputError: {
    borderColor: '#d64545',
  },
  fieldError: {
    color: '#ff9c9c',
    fontSize: 12,
    fontWeight: '700',
    marginTop: -4,
    marginBottom: 10,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  segment: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: colors.surfaceMid,
    borderWidth: 1,
    borderColor: colors.borderDark,
    paddingVertical: 9,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  segmentText: {
    color: colors.textSecondary,
    fontWeight: '800',
    fontSize: 12,
  },
  segmentTextActive: {
    color: colors.successText,
  },
  catalogResults: {
    maxHeight: 180,
    marginBottom: 10,
  },
  catalogRow: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderDark,
    padding: 10,
    marginBottom: 8,
    backgroundColor: colors.surfaceMid,
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
