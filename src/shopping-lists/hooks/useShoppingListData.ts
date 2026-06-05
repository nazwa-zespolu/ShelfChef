import {useCallback, useMemo, useState} from 'react';
import type {ShoppingList} from '../../app/ShoppingList';
import type {
  AutoShoppingListItemState,
  ShoppingListSummary,
  ShoppingSuggestion,
} from '../../domain/types';
import type {ShoppingListRepository} from '../../infrastructure/ShoppingListRepository';
import type {ShoppingListCardStats, ShoppingListFilter} from '../types';

type UseShoppingListDataOptions = {
  shoppingList: ShoppingList;
  shoppingRepository: ShoppingListRepository;
  listSearch: string;
  listFilter: ShoppingListFilter;
  itemSearch: string;
};

export function useShoppingListData({
  shoppingList,
  shoppingRepository,
  listSearch,
  listFilter,
  itemSearch,
}: UseShoppingListDataOptions) {
  const [lists, setLists] = useState<ShoppingListSummary[]>([]);
  const [suggestions, setSuggestions] = useState<ShoppingSuggestion[]>([]);
  const [selectedList, setSelectedList] = useState<ShoppingListSummary | null>(null);
  const [items, setItems] = useState<AutoShoppingListItemState[]>([]);
  const [loading, setLoading] = useState(true);
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
  }, [shoppingList, shoppingRepository]);

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
  }, [shoppingList]);

  return {
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
  };
}
