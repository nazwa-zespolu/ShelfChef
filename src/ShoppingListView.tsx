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
  CatalogProduct,
  ShoppingItemStatus,
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
import {useShoppingListData} from './shopping-lists/hooks/useShoppingListData';
import {AddItemModal} from './shopping-lists/modals/AddItemModal';
import {CatalogLinksModal} from './shopping-lists/modals/CatalogLinksModal';
import {DeleteListModal} from './shopping-lists/modals/DeleteListModal';
import {EditItemModal} from './shopping-lists/modals/EditItemModal';
import {ListFormModal} from './shopping-lists/modals/ListFormModal';
import {parseQuantityInput} from './shopping-lists/quantity';
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
  const [addOpen, setAddOpen] = useState(false);
  const [addItemFeedback, setAddItemFeedback] = useState<FeedbackMessage | null>(null);
  const [addQuantity, setAddQuantity] = useState('1');
  const [addIconKey, setAddIconKey] = useState<ShoppingListIconKey>('box');
  const [addIconColorKey, setAddIconColorKey] = useState<ShoppingListIconColorKey>(
    DEFAULT_SHOPPING_LIST_ICON_COLOR_KEY,
  );
  const [editingItem, setEditingItem] = useState<AutoShoppingListItemState | null>(null);
  const [editItemName, setEditItemName] = useState('');
  const [editItemIconKey, setEditItemIconKey] = useState<ShoppingListIconKey>('box');
  const [editItemIconColorKey, setEditItemIconColorKey] = useState<ShoppingListIconColorKey>(
    DEFAULT_SHOPPING_LIST_ICON_COLOR_KEY,
  );
  const [editItemFeedback, setEditItemFeedback] = useState<FeedbackMessage | null>(null);
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogResults, setCatalogResults] = useState<CatalogProduct[]>([]);
  const [selectedCatalog, setSelectedCatalog] = useState<CatalogProduct | null>(null);
  const [linkingItem, setLinkingItem] = useState<AutoShoppingListItemState | null>(null);
  const [linkCatalogQuery, setLinkCatalogQuery] = useState('');
  const [linkCatalogResults, setLinkCatalogResults] = useState<CatalogProduct[]>([]);
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
  const [catalogLinksFeedback, setCatalogLinksFeedback] = useState<FeedbackMessage | null>(null);
  const catalogLinksFeedbackRunId = useRef(0);
  const hasPlayedSwipeHint = useRef(false);
  const [swipeHintItemId, setSwipeHintItemId] = useState<string | null>(null);

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

  const showCatalogLinksFeedback = useCallback((message: string, tone: FeedbackTone = 'success') => {
    const runId = catalogLinksFeedbackRunId.current + 1;
    catalogLinksFeedbackRunId.current = runId;
    setCatalogLinksFeedback({message, tone});
    setTimeout(() => {
      if (catalogLinksFeedbackRunId.current === runId) {
        setCatalogLinksFeedback(null);
      }
    }, 1800);
  }, []);

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
  }, [addOpen, createOpen, editOpen, editingItem, linkingItem, mode, onRequestClose, pendingDeleteList]);

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
    } catch (e) {
      console.error('[ShelfChef] updateListOrder failed', e);
      showToast('Nie udało się zmienić kolejności list', 'error');
      loadLists().catch(() => {});
    }
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

  const openAddItem = useCallback(() => {
    setAddQuantity('1');
    setAddIconKey('box');
    setAddIconColorKey(DEFAULT_SHOPPING_LIST_ICON_COLOR_KEY);
    setCatalogQuery('');
    setCatalogResults([]);
    setSelectedCatalog(null);
    setAddItemFeedback(null);
    setAddOpen(true);
  }, []);

  const searchCatalog = useCallback(async (query: string) => {
    setCatalogQuery(query);
    setSelectedCatalog(null);
    setAddItemFeedback(null);
    if (!query.trim()) {
      setCatalogResults([]);
      return;
    }
    try {
      const results = await shoppingRepository.searchCatalogProducts(query);
      setCatalogResults(results);
    } catch (e) {
      console.error('[ShelfChef] searchCatalog failed', e);
      setCatalogResults([]);
      setAddItemFeedback({message: 'Nie udało się wyszukać katalogu', tone: 'error'});
    }
  }, []);

  const openCatalogLinks = useCallback((item: AutoShoppingListItemState) => {
    if (item.catalogProductId) {
      return;
    }
    setLinkingItem(item);
    setLinkCatalogQuery('');
    setLinkCatalogResults([]);
    setCatalogLinksFeedback(null);
  }, []);

  const openEditItem = useCallback((item: AutoShoppingListItemState) => {
    if (item.catalogProductId) {
      return;
    }
    setEditItemName(item.label);
    setEditItemIconKey(item.iconKey);
    setEditItemIconColorKey(item.iconColorKey);
    setEditItemFeedback(null);
    setEditingItem(item);
  }, []);

  const updateTextItem = useCallback(async () => {
    if (!selectedList || !editingItem) {
      return;
    }
    const label = editItemName.trim();
    if (!label) {
      return;
    }
    setBusy(true);
    try {
      await shoppingList.updateTextItem(editingItem.id, {
        label,
        iconKey: editItemIconKey,
        iconColorKey: editItemIconColorKey,
      });
      setEditItemFeedback(null);
      setEditingItem(null);
      await loadSelectedList(selectedList);
      const nextSuggestions = await shoppingList.generateReplenishmentSuggestions();
      setSuggestions(nextSuggestions);
      showToast('Zapisano produkt');
    } catch (e) {
      console.error('[ShelfChef] updateTextItem failed', e);
      setEditItemFeedback({message: 'Nie udało się zapisać produktu', tone: 'error'});
    } finally {
      setBusy(false);
    }
  }, [editItemIconColorKey, editItemIconKey, editItemName, editingItem, loadSelectedList, selectedList, setSuggestions, showToast]);

  const searchCatalogLinks = useCallback(async (query: string) => {
    setLinkCatalogQuery(query);
    setCatalogLinksFeedback(null);
    if (!query.trim()) {
      setLinkCatalogResults([]);
      return;
    }
    try {
      const results = await shoppingRepository.searchCatalogProducts(query);
      setLinkCatalogResults(results);
    } catch (e) {
      console.error('[ShelfChef] searchCatalogLinks failed', e);
      setLinkCatalogResults([]);
      showCatalogLinksFeedback('Nie udało się wyszukać katalogu', 'error');
    }
  }, [showCatalogLinksFeedback]);

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
        showCatalogLinksFeedback(`Powiązano z katalogiem: ${product.name}`);
      } catch (e) {
        console.error('[ShelfChef] linkCatalogProduct failed', e);
        showCatalogLinksFeedback('Nie udało się dodać powiązania', 'error');
      } finally {
        setBusy(false);
      }
    },
    [linkingItem, loadSelectedList, selectedList, setSuggestions, showCatalogLinksFeedback],
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
        showCatalogLinksFeedback('Usunięto powiązanie z katalogiem');
      } catch (e) {
        console.error('[ShelfChef] unlinkCatalogProduct failed', e);
        showCatalogLinksFeedback('Nie udało się usunąć powiązania', 'error');
      } finally {
        setBusy(false);
      }
    },
    [linkingItem, loadSelectedList, selectedList, setSuggestions, showCatalogLinksFeedback],
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
    const shouldPlaySwipeHint =
      selectedList.type === 'manual' &&
      items.length === 0 &&
      lists.length <= 3 &&
      !hasPlayedSwipeHint.current;

    setBusy(true);
    try {
      let addedItemId: string | null = null;
      if (selectedCatalog) {
        const addedItem = await shoppingList.addItem(selectedList.id, {
          catalogProductId: selectedCatalog.id,
          label: selectedCatalog.name,
          iconKey: addIconKey,
          iconColorKey: addIconColorKey,
          quantity,
        });
        addedItemId = addedItem.id;
      } else {
        const addedItem = await shoppingList.addItem(selectedList.id, {
          label: productLabel,
          iconKey: addIconKey,
          iconColorKey: addIconColorKey,
          quantity,
        });
        addedItemId = addedItem.id;
      }
      setAddItemFeedback(null);
      setAddOpen(false);
      await loadSelectedList(selectedList);
      if (shouldPlaySwipeHint && addedItemId) {
        hasPlayedSwipeHint.current = true;
        setSwipeHintItemId(addedItemId);
      }
      const nextSuggestions = await shoppingList.generateReplenishmentSuggestions();
      setSuggestions(nextSuggestions);
      showToast(
        selectedCatalog
          ? `Dodano z katalogu: ${selectedCatalog.name}`
          : `Dodano produkt tekstowy: ${productLabel}`,
      );
    } catch (e) {
      console.error('[ShelfChef] addItem failed', e);
      setAddItemFeedback({message: 'Nie udało się dodać produktu', tone: 'error'});
    } finally {
      setBusy(false);
    }
  }, [addIconColorKey, addIconKey, addQuantity, catalogQuery, items.length, lists.length, loadSelectedList, selectedCatalog, selectedList, setSuggestions, showToast]);

  const updateStatus = useCallback(
    async (itemId: string, status: ShoppingItemStatus) => {
      if (!selectedList) {
        return;
      }
      setBusy(true);
      try {
        await shoppingList.updateItemStatus(itemId, status);
        await loadSelectedList(selectedList);
      } catch (e) {
        console.error('[ShelfChef] updateItemStatus failed', e);
        showToast('Nie udało się zaktualizować produktu', 'error');
      } finally {
        setBusy(false);
      }
    },
    [loadSelectedList, selectedList, showToast],
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
      } catch (e) {
        console.error('[ShelfChef] updateItemQuantity failed', e);
        showToast('Nie udało się zaktualizować produktu', 'error');
      } finally {
        setBusy(false);
      }
    },
    [loadSelectedList, selectedList, showToast],
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
    } catch (e) {
      console.error('[ShelfChef] updateItemOrder failed', e);
      showToast('Nie udało się zmienić kolejności produktów', 'error');
      loadSelectedList(selectedList).catch(() => {});
    }
  }, [itemSearch, items, loadSelectedList, selectedList, setItems, showToast]);

  const deleteItem = useCallback(
    async (itemId: string) => {
      if (!selectedList) {
        return;
      }
      const deletedItemLabel = items.find(item => item.id === itemId)?.label ?? 'Produkt';
      setBusy(true);
      try {
        await shoppingRepository.deleteItem(itemId);
        await loadSelectedList(selectedList);
        showToast(`Usunięto produkt: ${deletedItemLabel}`);
      } catch (e) {
        console.error('[ShelfChef] deleteItem failed', e);
        showToast('Nie udało się usunąć produktu', 'error');
      } finally {
        setBusy(false);
      }
    },
    [items, loadSelectedList, selectedList, showToast],
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
      onDelete={deleteItem}
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
          loading={loading}
          bottomInset={insets.bottom}
          renderManualItem={renderManualItem}
          renderAutoItem={renderAutoItem}
          onBack={goBackOneLevel}
          onEditList={openEditList}
          onChangeItemSearch={setItemSearch}
          onRefresh={refreshCurrent}
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
        onSelectCatalog={product => {
          setSelectedCatalog(product);
          setCatalogQuery(product.name);
        }}
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
