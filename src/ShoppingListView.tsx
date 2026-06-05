import React, {useCallback, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Animated,
  Alert,
  BackHandler,
  type DimensionValue,
  FlatList,
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
import {Check, Lock, Plus, RefreshCcw, Search, Settings, ShoppingBag, Unlock, X} from 'lucide-react-native';
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
import {ShoppingItemIconBubble} from './shopping-lists/components/ShoppingItemIconBubble';
import {
  AutoShoppingItemRow,
  ManualShoppingItemRow,
} from './shopping-lists/components/ShoppingItemRows';
import type {FeedbackMessage, FeedbackTone} from './shopping-lists/components/InlineFeedback';
import {AddItemModal} from './shopping-lists/modals/AddItemModal';
import {CatalogLinksModal} from './shopping-lists/modals/CatalogLinksModal';
import {DeleteListModal} from './shopping-lists/modals/DeleteListModal';
import {EditItemModal} from './shopping-lists/modals/EditItemModal';
import {ListFormModal} from './shopping-lists/modals/ListFormModal';
import {parseQuantityInput} from './shopping-lists/quantity';
import {
  DEFAULT_SHOPPING_LIST_ICON_COLOR_KEY,
  getShoppingListIconColorDefinition,
  getShoppingListIconDefinition,
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
  const [listFilter, setListFilter] = useState<ListFilter>('all');
  const [listStats, setListStats] = useState<Record<string, ShoppingListCardStats>>({});
  const [toast, setToast] = useState<FeedbackMessage | null>(null);
  const toastAnim = useRef(new Animated.Value(0)).current;
  const toastRunId = useRef(0);
  const [catalogLinksFeedback, setCatalogLinksFeedback] = useState<FeedbackMessage | null>(null);
  const catalogLinksFeedbackRunId = useRef(0);
  const hasPlayedSwipeHint = useRef(false);
  const [swipeHintItemId, setSwipeHintItemId] = useState<string | null>(null);

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
  }, [editIconColorKey, editIconKey, editName, loadLists, loadSelectedList, selectedList, showToast]);

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
  }, [lists, loadLists, showToast]);

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
  }, [editItemIconColorKey, editItemIconKey, editItemName, editingItem, loadSelectedList, selectedList, showToast]);

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
    [linkingItem, loadSelectedList, selectedList, showCatalogLinksFeedback],
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
    [linkingItem, loadSelectedList, selectedList, showCatalogLinksFeedback],
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
  }, [addIconColorKey, addIconKey, addQuantity, catalogQuery, items.length, lists.length, loadSelectedList, selectedCatalog, selectedList, showToast]);

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
  }, [itemSearch, items, loadSelectedList, selectedList, showToast]);

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
  }, [showToast]);

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
  }, [showToast, targetListId]);

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

  const renderListRow = ({item}: {item: ShoppingListSummary}) => (
    <SortableListRow
      item={item}
      stats={listStats[item.id] ?? EMPTY_LIST_STATS}
      onOpen={openList}
      onMove={moveList}
      onRequestDelete={list => {
        setDeleteListFeedback(null);
        setPendingDeleteList(list);
      }}
    />
  );

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
            <ShoppingItemIconBubble
              iconKey={item.iconKey ?? 'box'}
              iconColorKey={item.iconColorKey ?? DEFAULT_SHOPPING_LIST_ICON_COLOR_KEY}
              imageUrl={item.imageUrl}
            />
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
            <Text style={styles.emptyDescription}>
              Braki z aktywnych list auto pojawią się tutaj.
            </Text>
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
            <View style={styles.detailsTitleRow}>
              <Text style={[styles.manualDetailsTitle, styles.detailsTitleText]} numberOfLines={1}>{selectedList.name}</Text>
              <Pressable
                onPress={openEditList}
                accessibilityLabel="Ustawienia listy"
                hitSlop={8}
                style={({pressed}) => [styles.listSettingsButton, pressed && styles.pressed]}>
                <Settings color={colors.accent} size={22} strokeWidth={2.2} />
              </Pressable>
            </View>
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
              items.length === 0 ? (
                <EmptyState
                  title="Dodaj pierwszy produkt"
                  description="Przesuń w prawo, żeby oznaczyć jako kupiony. W lewo, żeby usunąć."
                />
              ) : (
                <EmptyState title="Brak pasujących produktów" />
              )
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
          <View style={styles.detailsTitleRow}>
            <Text style={[styles.manualDetailsTitle, styles.detailsTitleText]} numberOfLines={1}>{selectedList.name}</Text>
            <Pressable
              onPress={openEditList}
              accessibilityLabel="Ustawienia listy"
              hitSlop={8}
              style={({pressed}) => [styles.listSettingsButton, pressed && styles.pressed]}>
              <Settings color={colors.accent} size={22} strokeWidth={2.2} />
            </Pressable>
          </View>
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
            items.length === 0 ? (
              <EmptyState
                title="Dodaj minimum zapasów"
                description="Dodaj produkty, które chcesz mieć w zapasach. Braki pojawią się w Do uzupełnienia."
              />
            ) : (
              <EmptyState title="Brak pasujących produktów" />
            )
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
            onPress={() => {
              setListFormFeedback(null);
              setCreateOpen(true);
            }}
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
        ListEmptyComponent={
          lists.length === 0 ? (
            <EmptyState
              title="Zacznij od pierwszej listy"
              description="Manualna sprawdzi się na zakupy, auto pokaże braki w zapasach."
              details={[
                'Przytrzymaj ikonę, aby zmienić kolejność.',
                'Przesuń listę w lewo, aby usunąć.',
              ]}
            />
          ) : (
            <EmptyState title="Brak pasujących list" />
          )
        }
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

function EmptyState({
  title,
  description,
  details = [],
}: {
  title: string;
  description?: string;
  details?: string[];
}) {
  return (
    <View style={styles.emptyBox}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {description ? (
        <Text style={styles.emptyDescription}>{description}</Text>
      ) : null}
      {details.length > 0 ? (
        <View style={styles.emptyDetails}>
          {details.map(detail => (
            <Text key={detail} style={styles.emptyDetailText}>
              {detail}
            </Text>
          ))}
        </View>
      ) : null}
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
  detailsTitleRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  detailsTitleText: {
    flex: 1,
    minWidth: 0,
  },
  listSettingsButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
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
  manualItemTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '900',
  },
  manualItemMeta: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 4,
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
    textAlign: 'center',
  },
  emptyDescription: {
    maxWidth: 300,
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
  },
  emptyDetails: {
    marginTop: 12,
    gap: 4,
    alignItems: 'center',
  },
  emptyDetailText: {
    maxWidth: 310,
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    textAlign: 'center',
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
});
