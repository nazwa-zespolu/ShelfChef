import React, {useCallback, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
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
  const [completeOpen, setCompleteOpen] = useState(false);
  const [expiryDate, setExpiryDate] = useState('');
  const [targetListId, setTargetListId] = useState<string | null>(null);

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

  React.useEffect(() => {
    loadLists().catch(() => setLoading(false));
  }, [loadLists]);

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
    const quantity = Math.max(1, Number.parseInt(addQuantity, 10) || 1);
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
    try {
      const purchased = items.filter(item => item.status === 'purchased');
      const payload = Object.fromEntries(
        purchased.map(item => [item.id, expiryDate.trim() || null]),
      );
      await shoppingList.completePurchase(selectedList.id, payload);
      setCompleteOpen(false);
      setExpiryDate('');
      await loadSelectedList(selectedList);
      const nextSuggestions = await shoppingList.generateReplenishmentSuggestions();
      setSuggestions(nextSuggestions);
      onInventoryChanged?.();
    } finally {
      setBusy(false);
    }
  }, [expiryDate, items, loadSelectedList, onInventoryChanged, selectedList]);

  const renderListRow = ({item}: {item: ShoppingListSummary}) => (
    <Pressable
      onPress={() => openList(item)}
      style={({pressed}) => [styles.card, pressed && styles.cardPressed]}>
      <View style={styles.rowBetween}>
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
  );

  const renderItem = ({item}: {item: AutoShoppingListItemState}) => {
    const shownStatus = selectedList?.type === 'auto' && !selectedList.isLocked
      ? item.effectiveStatus
      : item.status;
    return (
      <View style={styles.itemCard}>
        <View style={styles.rowBetween}>
          <View style={styles.rowText}>
            <Text style={styles.itemTitle} numberOfLines={2}>{item.label}</Text>
            <Text style={styles.itemMeta}>
              {statusLabel(shownStatus)} · ilość {item.quantity}
              {selectedList?.type === 'auto' && item.catalogProductId
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
          <ActionButton label="Usuń" danger onPress={() => deleteItem(item.id)} />
        </View>
      </View>
    );
  };

  const renderSuggestions = () => (
    <View style={styles.content}>
      <Header title="Do uzupełnienia" onBack={() => setMode('lists')} />
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
            (!targetListId || suggestions.length === 0 || busy) && styles.disabled,
            pressed && styles.pressed,
          ]}>
          <Text style={styles.primaryButtonText}>Dodaj wszystko</Text>
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
        <Header title={selectedList.name} onBack={() => { setMode('lists'); loadLists().catch(() => {}); }} />
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
            onPress={() => setCompleteOpen(true)}
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
        <Pressable onPress={onRequestClose} style={({pressed}) => [styles.back, pressed && styles.pressed]} hitSlop={10}>
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
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadLists} tintColor={colors.success} />}
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
      <CompleteModal
        visible={completeOpen}
        expiryDate={expiryDate}
        busy={busy}
        onChangeExpiryDate={setExpiryDate}
        onClose={() => setCompleteOpen(false)}
        onSubmit={completePurchase}
      />
    </View>
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
            keyboardType="number-pad"
            placeholder="Ilość"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          <ModalActions busy={busy} onClose={onClose} onSubmit={onSubmit} submitLabel="Dodaj" />
        </View>
      </View>
    </Modal>
  );
}

function CompleteModal({
  visible,
  expiryDate,
  busy,
  onChangeExpiryDate,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  expiryDate: string;
  busy: boolean;
  onChangeExpiryDate: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>Finalizacja</Text>
          <TextInput
            value={expiryDate}
            onChangeText={onChangeExpiryDate}
            placeholder="Data ważności YYYY-MM-DD"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          <ModalActions busy={busy} onClose={onClose} onSubmit={onSubmit} submitLabel="Zapisz" />
        </View>
      </View>
    </Modal>
  );
}

function ModalActions({
  busy,
  submitLabel,
  onClose,
  onSubmit,
}: {
  busy: boolean;
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
        disabled={busy}
        onPress={onSubmit}
        style={({pressed}) => [styles.primaryButton, busy && styles.disabled, pressed && styles.pressed]}>
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
  cardPressed: {
    opacity: 0.86,
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
