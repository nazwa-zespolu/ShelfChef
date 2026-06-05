import {useCallback, useRef, useState, type Dispatch, type SetStateAction} from 'react';
import type {ShoppingList} from '../../app/ShoppingList';
import type {
  AutoShoppingListItemState,
  CatalogProduct,
  ShoppingItemStatus,
  ShoppingListIconColorKey,
  ShoppingListIconKey,
  ShoppingListSummary,
  ShoppingSuggestion,
} from '../../domain/types';
import type {ShoppingListRepository} from '../../infrastructure/ShoppingListRepository';
import {DEFAULT_SHOPPING_LIST_ICON_COLOR_KEY} from '../../shoppingListIcons';
import type {FeedbackMessage, FeedbackTone} from '../components/InlineFeedback';
import {parseQuantityInput} from '../quantity';

type ShoppingListDetails = {
  list: ShoppingListSummary;
  items: AutoShoppingListItemState[];
};

type UseShoppingItemActionsOptions = {
  shoppingList: ShoppingList;
  shoppingRepository: ShoppingListRepository;
  selectedList: ShoppingListSummary | null;
  items: AutoShoppingListItemState[];
  listsCount: number;
  itemSearch: string;
  loadSelectedList: (list: ShoppingListSummary) => Promise<ShoppingListDetails>;
  setItems: Dispatch<SetStateAction<AutoShoppingListItemState[]>>;
  setSuggestions: Dispatch<SetStateAction<ShoppingSuggestion[]>>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  showToast: (message: string, tone?: FeedbackTone) => void;
};

export function useShoppingItemActions({
  shoppingList,
  shoppingRepository,
  selectedList,
  items,
  listsCount,
  itemSearch,
  loadSelectedList,
  setItems,
  setSuggestions,
  setBusy,
  showToast,
}: UseShoppingItemActionsOptions) {
  const [addOpen, setAddOpen] = useState(false);
  const [addItemFeedback, setAddItemFeedback] = useState<FeedbackMessage | null>(null);
  const [addQuantity, setAddQuantity] = useState('1');
  const [addIconKey, setAddIconKey] = useState<ShoppingListIconKey>('box');
  const [addIconColorKey, setAddIconColorKey] = useState<ShoppingListIconColorKey>(
    DEFAULT_SHOPPING_LIST_ICON_COLOR_KEY,
  );
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogResults, setCatalogResults] = useState<CatalogProduct[]>([]);
  const [selectedCatalog, setSelectedCatalog] = useState<CatalogProduct | null>(null);

  const [editingItem, setEditingItem] = useState<AutoShoppingListItemState | null>(null);
  const [editItemName, setEditItemName] = useState('');
  const [editItemIconKey, setEditItemIconKey] = useState<ShoppingListIconKey>('box');
  const [editItemIconColorKey, setEditItemIconColorKey] = useState<ShoppingListIconColorKey>(
    DEFAULT_SHOPPING_LIST_ICON_COLOR_KEY,
  );
  const [editItemFeedback, setEditItemFeedback] = useState<FeedbackMessage | null>(null);

  const [linkingItem, setLinkingItem] = useState<AutoShoppingListItemState | null>(null);
  const [linkCatalogQuery, setLinkCatalogQuery] = useState('');
  const [linkCatalogResults, setLinkCatalogResults] = useState<CatalogProduct[]>([]);
  const [catalogLinksFeedback, setCatalogLinksFeedback] = useState<FeedbackMessage | null>(null);
  const catalogLinksFeedbackRunId = useRef(0);

  const hasPlayedSwipeHint = useRef(false);
  const [swipeHintItemId, setSwipeHintItemId] = useState<string | null>(null);

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
  }, [shoppingRepository]);

  const selectCatalog = useCallback((product: CatalogProduct) => {
    setSelectedCatalog(product);
    setCatalogQuery(product.name);
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
  }, [
    editItemIconColorKey,
    editItemIconKey,
    editItemName,
    editingItem,
    loadSelectedList,
    selectedList,
    setBusy,
    setSuggestions,
    shoppingList,
    showToast,
  ]);

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
  }, [shoppingRepository, showCatalogLinksFeedback]);

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
    [
      linkingItem,
      loadSelectedList,
      selectedList,
      setBusy,
      setSuggestions,
      shoppingList,
      shoppingRepository,
      showCatalogLinksFeedback,
    ],
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
    [
      linkingItem,
      loadSelectedList,
      selectedList,
      setBusy,
      setSuggestions,
      shoppingList,
      shoppingRepository,
      showCatalogLinksFeedback,
    ],
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
      listsCount <= 3 &&
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
  }, [
    addIconColorKey,
    addIconKey,
    addQuantity,
    catalogQuery,
    items.length,
    listsCount,
    loadSelectedList,
    selectedCatalog,
    selectedList,
    setBusy,
    setSuggestions,
    shoppingList,
    showToast,
  ]);

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
    [loadSelectedList, selectedList, setBusy, shoppingList, showToast],
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
    [loadSelectedList, selectedList, setBusy, shoppingRepository, showToast],
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
  }, [
    itemSearch,
    items,
    loadSelectedList,
    selectedList,
    setItems,
    shoppingRepository,
    showToast,
  ]);

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
    [items, loadSelectedList, selectedList, setBusy, shoppingRepository, showToast],
  );

  return {
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
    setCatalogQuery,
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
  };
}
