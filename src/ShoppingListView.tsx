import React, {useCallback, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Animated,
  Alert,
  BackHandler,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Check, X} from 'lucide-react-native';
import {
  AutoShoppingListItemState,
  ShoppingListIconColorKey,
  ShoppingListIconKey,
  ShoppingListSummary,
  ShoppingListType,
} from './domain/types';
import {ShoppingList} from './app/ShoppingList';
import {ProductRepository} from './infrastructure/ProductRepository';
import {ShoppingListRepository} from './infrastructure/ShoppingListRepository';
import {
  AutoShoppingItemRow,
  ManualShoppingItemRow,
} from './shopping-lists/components/ShoppingItemRows';
import type {FeedbackMessage, FeedbackTone} from './shopping-lists/components/InlineFeedback';
import {useShoppingItemActions} from './shopping-lists/hooks/useShoppingItemActions';
import {useShoppingListData} from './shopping-lists/hooks/useShoppingListData';
import {AddItemModal} from './shopping-lists/modals/AddItemModal';
import {CatalogLinksModal} from './shopping-lists/modals/CatalogLinksModal';
import {DeleteListModal} from './shopping-lists/modals/DeleteListModal';
import {EditItemModal} from './shopping-lists/modals/EditItemModal';
import {ListFormModal} from './shopping-lists/modals/ListFormModal';
import {animateDragReorder} from './shopping-lists/dragAnimation';
import {ShoppingListsScreen} from './shopping-lists/screens/ShoppingListsScreen';
import {ReplenishmentSuggestionsScreen} from './shopping-lists/screens/ReplenishmentSuggestionsScreen';
import {ShoppingListDetailsScreen} from './shopping-lists/screens/ShoppingListDetailsScreen';
import type {ShoppingListFilter} from './shopping-lists/types';
import {DEFAULT_SHOPPING_LIST_ICON_COLOR_KEY} from './shoppingListIcons';
import {colors} from './theme/colors';

type ShoppingListViewProps = {
  onRequestClose: () => void;
  onInventoryChanged?: () => void;
  setBottomNavVisible?: (visible: boolean) => void;
};

type ScreenMode = 'lists' | 'suggestions' | 'details';

const shoppingRepository = new ShoppingListRepository();
const productRepository = new ProductRepository();
const shoppingList = new ShoppingList(shoppingRepository, productRepository);

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
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createType, setCreateType] = useState<ShoppingListType>('manual');
  const [createIconKey, setCreateIconKey] = useState<ShoppingListIconKey>('basket');
  const [createIconColorKey, setCreateIconColorKey] = useState<ShoppingListIconColorKey>(
    DEFAULT_SHOPPING_LIST_ICON_COLOR_KEY,
  );
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editIconKey, setEditIconKey] = useState<ShoppingListIconKey>('basket');
  const [editIconColorKey, setEditIconColorKey] = useState<ShoppingListIconColorKey>(
    DEFAULT_SHOPPING_LIST_ICON_COLOR_KEY,
  );
  const [listFormFeedback, setListFormFeedback] = useState<FeedbackMessage | null>(null);
  const [targetListId, setTargetListId] = useState<string | null>(null);
  const [pendingDeleteList, setPendingDeleteList] = useState<ShoppingListSummary | null>(null);
  const [deleteListFeedback, setDeleteListFeedback] = useState<FeedbackMessage | null>(null);
  const [listSearch, setListSearch] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [listFilter, setListFilter] = useState<ShoppingListFilter>('all');
  const {
    lists,
    setLists,
    suggestions,
    setSuggestions,
    selectedList,
    setSelectedList,
    items,
    setItems,
    loading,
    setLoading,
    listStats,
    manualLists,
    filteredLists,
    filteredItems,
    loadLists,
    loadSelectedList,
  } = useShoppingListData({
    shoppingList,
    shoppingRepository,
    listSearch,
    listFilter,
    itemSearch,
  });
  const [toast, setToast] = useState<FeedbackMessage | null>(null);
  const toastAnim = useRef(new Animated.Value(0)).current;
  const toastRunId = useRef(0);

  const toastTop = useMemo(() => {
    return insets.top + 12;
  }, [insets.top]);

  const showToast = useCallback(
    (message: string, tone: FeedbackTone = 'success') => {
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

  const {
    addOpen,
    setAddOpen,
    addItemFeedback,
    setAddItemFeedback,
    addQuantity,
    setAddQuantity,
    addIconKey,
    setAddIconKey,
    addIconColorKey,
    setAddIconColorKey,
    catalogQuery,
    catalogResults,
    selectedCatalog,
    editingItem,
    setEditingItem,
    editItemName,
    setEditItemName,
    editItemIconKey,
    setEditItemIconKey,
    editItemIconColorKey,
    setEditItemIconColorKey,
    editItemFeedback,
    setEditItemFeedback,
    linkingItem,
    setLinkingItem,
    linkCatalogQuery,
    linkCatalogResults,
    catalogLinksFeedback,
    setCatalogLinksFeedback,
    swipeHintItemId,
    setSwipeHintItemId,
    openAddItem,
    searchCatalog,
    selectCatalog,
    openCatalogLinks,
    openEditItem,
    updateTextItem,
    searchCatalogLinks,
    linkCatalogProduct,
    unlinkCatalogProduct,
    addItem,
    updateStatus,
    updateQuantity,
    moveItem,
    deleteItem,
  } = useShoppingItemActions({
    shoppingList,
    shoppingRepository,
    selectedList,
    items,
    listsCount: lists.length,
    itemSearch,
    loadSelectedList,
    setItems,
    setSuggestions,
    setBusy,
    showToast,
  });

  const goBackOneLevel = useCallback(() => {
    if (pendingDeleteList) {
      setPendingDeleteList(null);
      setDeleteListFeedback(null);
      return true;
    }
    if (addOpen) {
      setAddOpen(false);
      return true;
    }
    if (editingItem) {
      setEditingItem(null);
      setEditItemFeedback(null);
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
    if (editOpen) {
      setEditOpen(false);
      return true;
    }
    if (mode === 'details' || mode === 'suggestions') {
      setMode('lists');
      return true;
    }

    onRequestClose();
    return true;
  }, [
    addOpen,
    createOpen,
    editOpen,
    editingItem,
    linkingItem,
    mode,
    onRequestClose,
    pendingDeleteList,
    setAddOpen,
    setEditItemFeedback,
    setEditingItem,
    setLinkingItem,
  ]);

  React.useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', goBackOneLevel);
    return () => subscription.remove();
  }, [goBackOneLevel]);

  React.useEffect(() => {
    if (mode === 'lists') {
      loadLists().catch(() => setLoading(false));
    }
  }, [loadLists, mode, setLoading]);

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
    [loadSelectedList, setLoading],
  );

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
      setListFormFeedback(null);
      setCreateOpen(false);
      await loadLists();
      openList(created);
      showToast(`Utworzono listę: ${created.name}`);
    } catch (e) {
      console.error('[ShelfChef] createList failed', e);
      setListFormFeedback({message: 'Nie udało się utworzyć listy', tone: 'error'});
    } finally {
      setBusy(false);
    }
  }, [createIconColorKey, createIconKey, createName, createType, loadLists, openList, showToast]);

  const openEditList = useCallback(() => {
    if (!selectedList) {
      return;
    }
    setEditName(selectedList.name);
    setEditIconKey(selectedList.iconKey);
    setEditIconColorKey(selectedList.iconColorKey);
    setListFormFeedback(null);
    setEditOpen(true);
  }, [selectedList]);

  const updateListSettings = useCallback(async () => {
    if (!selectedList) {
      return;
    }
    const name = editName.trim();
    if (!name) {
      return;
    }
    setBusy(true);
    try {
      const updated = await shoppingList.updateList(
        selectedList.id,
        name,
        editIconKey,
        editIconColorKey,
      );
      setListFormFeedback(null);
      setEditOpen(false);
      setSelectedList(updated);
      setLists(current => current.map(list => (list.id === updated.id ? updated : list)));
      await loadSelectedList(updated);
      await loadLists();
      showToast('Zapisano ustawienia listy');
    } catch (e) {
      console.error('[ShelfChef] updateListSettings failed', e);
      setListFormFeedback({message: 'Nie udało się zapisać ustawień', tone: 'error'});
    } finally {
      setBusy(false);
    }
  }, [editIconColorKey, editIconKey, editName, loadLists, loadSelectedList, selectedList, setLists, setSelectedList, showToast]);

  const moveList = useCallback((listId: string, direction: -1 | 1) => {
    const currentIndex = lists.findIndex(list => list.id === listId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= lists.length) {
      return false;
    }
    const nextLists = [...lists];
    const [moved] = nextLists.splice(currentIndex, 1);
    nextLists.splice(nextIndex, 0, moved);
    const ordered = nextLists.map((list, index) => ({...list, sortOrder: index}));
    animateDragReorder();
    setLists(ordered);
    shoppingRepository.updateListOrder(ordered.map(list => list.id)).catch(e => {
      console.error('[ShelfChef] updateListOrder failed', e);
      showToast('Nie udało się zmienić kolejności list', 'error');
      loadLists().catch(() => {});
    });
    return true;
  }, [lists, loadLists, setLists, showToast]);

  const deleteList = useCallback(async () => {
    if (!pendingDeleteList) {
      return;
    }
    const deletedListName = pendingDeleteList.name;
    setBusy(true);
    try {
      await shoppingRepository.deleteList(pendingDeleteList.id);
      setPendingDeleteList(null);
      setDeleteListFeedback(null);
      await loadLists();
      showToast(`Usunięto listę: ${deletedListName}`);
    } catch (e) {
      console.error('[ShelfChef] deleteList failed', e);
      setDeleteListFeedback({message: 'Nie udało się usunąć listy', tone: 'error'});
    } finally {
      setBusy(false);
    }
  }, [loadLists, pendingDeleteList, showToast]);

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
    } catch (e) {
      console.error('[ShelfChef] toggleLock failed', e);
      showToast('Nie udało się zmienić blokady listy', 'error');
    } finally {
      setBusy(false);
    }
  }, [loadLists, loadSelectedList, selectedList, showToast]);

  const openSuggestions = useCallback(async () => {
    setMode('suggestions');
    setLoading(true);
    try {
      const nextSuggestions = await shoppingList.generateReplenishmentSuggestions();
      setSuggestions(nextSuggestions);
      const nextLists = await shoppingRepository.getLists();
      setLists(nextLists);
      setTargetListId(nextLists.find(list => list.type === 'manual')?.id ?? null);
    } catch (e) {
      console.error('[ShelfChef] openSuggestions failed', e);
      showToast('Nie udało się odświeżyć sugestii', 'error');
    } finally {
      setLoading(false);
    }
  }, [setLists, setLoading, setSuggestions, showToast]);

  const mergeSuggestions = useCallback(async () => {
    if (!targetListId) {
      return;
    }
    setBusy(true);
    try {
      const summary = await shoppingList.addAllSuggestionsToList(targetListId);
      const [nextLists, nextSuggestions] = await Promise.all([
        shoppingRepository.getLists(),
        shoppingList.generateReplenishmentSuggestions(),
      ]);
      setLists(nextLists);
      setSuggestions(nextSuggestions);
      showToast(
        summary.added + summary.reactivated > 0
          ? 'Dodano sugestie do listy'
          : 'Lista jest już aktualna',
      );
    } catch (e) {
      console.error('[ShelfChef] mergeSuggestions failed', e);
      showToast('Nie udało się dodać sugestii', 'error');
    } finally {
      setBusy(false);
    }
  }, [setLists, setSuggestions, showToast, targetListId]);

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
      showToast('Zakupy sfinalizowane');
    } catch (e) {
      console.error('[ShelfChef] refresh after completePurchase failed', e);
    } finally {
      setBusy(false);
    }
  }, [items, loadLists, loadSelectedList, onInventoryChanged, selectedList, showToast]);

  const renderManualItem = ({item}: {item: AutoShoppingListItemState}) => (
    <ManualShoppingItemRow
      item={item}
      busy={busy}
      reorderEnabled={itemSearch.trim().length === 0}
      playSwipeHint={swipeHintItemId === item.id}
      onDelete={deleteItem}
      onMove={moveItem}
      onUpdateQuantity={updateQuantity}
      onUpdateStatus={updateStatus}
      onOpenLinks={openCatalogLinks}
      onEdit={openEditItem}
      onSwipeHintComplete={() => {
        setSwipeHintItemId(current => (current === item.id ? null : current));
      }}
    />
  );

  const renderAutoItem = ({item}: {item: AutoShoppingListItemState}) => (
    <AutoShoppingItemRow
      item={item}
      busy={busy}
      reorderEnabled={itemSearch.trim().length === 0}
      onDelete={deleteItem}
      onMove={moveItem}
      onUpdateQuantity={updateQuantity}
      onOpenLinks={openCatalogLinks}
      onEdit={openEditItem}
    />
  );

  return (
    <View style={[styles.root, {paddingTop: insets.top + 2}]}>
      {mode === 'lists' ? (
        <ShoppingListsScreen
          lists={lists}
          filteredLists={filteredLists}
          listSearch={listSearch}
          listFilter={listFilter}
          suggestionsCount={suggestions.length}
          listStats={listStats}
          onChangeListSearch={setListSearch}
          onChangeListFilter={setListFilter}
          onCreateList={() => {
            setListFormFeedback(null);
            setCreateOpen(true);
          }}
          onOpenSuggestions={openSuggestions}
          onOpenList={openList}
          onMoveList={moveList}
          onRequestDeleteList={list => {
            setDeleteListFeedback(null);
            setPendingDeleteList(list);
          }}
        />
      ) : null}
      {mode === 'suggestions' ? (
        <ReplenishmentSuggestionsScreen
          suggestions={suggestions}
          manualLists={manualLists}
          targetListId={targetListId}
          busy={busy}
          loading={loading}
          onBack={goBackOneLevel}
          onSelectTargetList={setTargetListId}
          onMergeSuggestions={mergeSuggestions}
          onRefresh={openSuggestions}
        />
      ) : null}
      {mode === 'details' && selectedList ? (
        <ShoppingListDetailsScreen
          list={selectedList}
          items={items}
          filteredItems={filteredItems}
          itemSearch={itemSearch}
          busy={busy}
          bottomInset={insets.bottom}
          renderManualItem={renderManualItem}
          renderAutoItem={renderAutoItem}
          onBack={goBackOneLevel}
          onEditList={openEditList}
          onChangeItemSearch={setItemSearch}
          onAddItem={openAddItem}
          onCompletePurchase={() => { completePurchase().catch(() => {}); }}
          onToggleLock={() => { toggleLock().catch(() => {}); }}
        />
      ) : null}
      {loading && lists.length === 0 && mode === 'lists' ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={colors.success} />
        </View>
      ) : null}
      <ListFormModal
        visible={createOpen}
        mode="create"
        name={createName}
        type={createType}
        iconKey={createIconKey}
        iconColorKey={createIconColorKey}
        feedback={listFormFeedback}
        busy={busy}
        onChangeName={setCreateName}
        onChangeType={setCreateType}
        onChangeIconKey={setCreateIconKey}
        onChangeIconColorKey={setCreateIconColorKey}
        onClose={() => {
          setCreateOpen(false);
          setListFormFeedback(null);
        }}
        onSubmit={createList}
      />
      <ListFormModal
        visible={editOpen}
        mode="edit"
        name={editName}
        type={selectedList?.type ?? 'manual'}
        iconKey={editIconKey}
        iconColorKey={editIconColorKey}
        feedback={listFormFeedback}
        busy={busy}
        onChangeName={setEditName}
        onChangeType={() => {}}
        onChangeIconKey={setEditIconKey}
        onChangeIconColorKey={setEditIconColorKey}
        onClose={() => {
          setEditOpen(false);
          setListFormFeedback(null);
        }}
        onSubmit={updateListSettings}
      />
      <AddItemModal
        visible={addOpen}
        quantity={addQuantity}
        iconKey={addIconKey}
        iconColorKey={addIconColorKey}
        catalogQuery={catalogQuery}
        catalogResults={catalogResults}
        selectedCatalog={selectedCatalog}
        feedback={addItemFeedback}
        busy={busy}
        onChangeQuantity={setAddQuantity}
        onChangeIconKey={setAddIconKey}
        onChangeIconColorKey={setAddIconColorKey}
        onChangeCatalogQuery={query => searchCatalog(query).catch(() => {})}
        onSelectCatalog={selectCatalog}
        onClose={() => {
          setAddOpen(false);
          setAddItemFeedback(null);
        }}
        onSubmit={addItem}
      />
      <EditItemModal
        item={editingItem}
        name={editItemName}
        iconKey={editItemIconKey}
        iconColorKey={editItemIconColorKey}
        feedback={editItemFeedback}
        busy={busy}
        onChangeName={setEditItemName}
        onChangeIconKey={setEditItemIconKey}
        onChangeIconColorKey={setEditItemIconColorKey}
        onClose={() => {
          setEditingItem(null);
          setEditItemFeedback(null);
        }}
        onSubmit={updateTextItem}
      />
      <CatalogLinksModal
        item={linkingItem}
        query={linkCatalogQuery}
        results={linkCatalogResults}
        feedback={catalogLinksFeedback}
        busy={busy}
        onChangeQuery={query => searchCatalogLinks(query).catch(() => {})}
        onLink={product => { linkCatalogProduct(product).catch(() => {}); }}
        onUnlink={catalogProductId => { unlinkCatalogProduct(catalogProductId).catch(() => {}); }}
        onClose={() => {
          setLinkingItem(null);
          setCatalogLinksFeedback(null);
        }}
      />
      <DeleteListModal
        list={pendingDeleteList}
        feedback={deleteListFeedback}
        busy={busy}
        onClose={() => {
          setPendingDeleteList(null);
          setDeleteListFeedback(null);
        }}
        onSubmit={deleteList}
      />
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
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
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
});
