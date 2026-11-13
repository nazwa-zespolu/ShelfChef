import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, BackHandler, FlatList, Image, Keyboard, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {ChevronRight, Package, Search} from 'lucide-react-native';
import {getProductRepository} from './app/services';
import {CatalogProductEditModal} from './components/CatalogProductEditModal';
import {AppToast, useAppToast} from './components/AppToast';
import {InlineFeedback} from './shopping-lists/components/InlineFeedback';
import {EmptyState} from './shopping-lists/components/EmptyState';
import type {CatalogProduct} from './domain/types';
import {CatalogProductDeleteError, CatalogProductUpdateError, type UpdateCatalogProductInput} from './infrastructure/ProductRepository';
import {colors} from './theme/colors';
import {shadowInsets, shadows} from './theme/shadows';

type DeleteConfirmation = {productId: string};

function editErrorMessage(error: unknown): string {
  if (error instanceof CatalogProductUpdateError) {
    switch (error.code) {
      case 'empty_name': return 'Podaj nazwę produktu.';
      case 'duplicate_name': return 'Produkt bez EAN o tej nazwie już istnieje. Wybierz inną nazwę.';
      case 'not_found': return 'Ten produkt nie jest już dostępny w katalogu. Zamknij edycję.';
    }
  }
  return 'Nie udało się zapisać zmian. Spróbuj ponownie.';
}

function deleteErrorMessage(error: unknown): string {
  if (error instanceof CatalogProductDeleteError) {
    switch (error.code) {
      case 'not_found': return 'Ten produkt nie jest już dostępny w katalogu. Zamknij edycję.';
      case 'in_inventory': return 'Produkt ma egzemplarze w spiżarni. Aby go usunąć z katalogu, najpierw usuń te egzemplarze.';
      case 'in_shopping_list': return 'Produkt jest powiązany z listą zakupową. Najpierw usuń pozycję lub jej powiązanie z produktem.';
      case 'has_children': return 'Nie można usunąć produktu, z którym są powiązane inne produkty w katalogu.';
    }
  }
  return 'Nie udało się usunąć produktu. Spróbuj ponownie.';
}

export default function ProductCatalogView({onRequestClose, onProductUpdated}: {
  onRequestClose: () => void;
  onProductUpdated?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const repository = useMemo(() => getProductRepository(), []);
  const mounted = useRef(true);
  const mutationRef = useRef(false);
  const deleteConfirmationRef = useRef<DeleteConfirmation | null>(null);
  const openingRequest = useRef(0);
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState<CatalogProduct | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmation | null>(null);
  const [pendingAction, setPendingAction] = useState<'save' | 'delete' | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const {toast, toastAnim, showToast} = useAppToast();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      deleteConfirmationRef.current = null;
      openingRequest.current += 1;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    setProducts([]);
    const request = query.trim()
      ? repository.searchCatalogProducts(query)
      : repository.getCatalogProducts();
    request.then(result => {
      if (active) {
        setProducts(result);
        setLoading(false);
      }
    }).catch(() => {
      if (active) {
        setLoadError('Nie udało się wczytać katalogu. Spróbuj ponownie.');
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, [query, reload, repository]);

  const closeEditor = useCallback(() => {
    if (!mutationRef.current) {
      Keyboard.dismiss();
      if (deleteConfirmationRef.current) {
        deleteConfirmationRef.current = null;
        setDeleteConfirmation(null);
      } else {
        setEditing(null);
      }
      setEditError(null);
    }
  }, []);

  const goBack = useCallback(() => {
    if (!mutationRef.current) {
      if (editing) {
        closeEditor();
      } else {
        openingRequest.current += 1;
        onRequestClose();
      }
    }
    return true;
  }, [closeEditor, editing, onRequestClose]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', goBack);
    return () => subscription.remove();
  }, [goBack]);

  const openProduct = async (id: string) => {
    if (mutationRef.current || openingId) {
      return;
    }
    const requestId = ++openingRequest.current;
    Keyboard.dismiss();
    setOpeningId(id);
    setOpenError(null);
    try {
      const product = await repository.findCatalogProductById(id);
      if (!mounted.current || requestId !== openingRequest.current) {
        return;
      }
      if (product) {
        setEditing(product);
        setEditError(null);
      } else {
        setOpenError('Ten produkt nie jest już dostępny w katalogu.');
        setReload(value => value + 1);
      }
    } catch {
      if (mounted.current && requestId === openingRequest.current) {
        setOpenError('Nie udało się otworzyć produktu. Spróbuj ponownie.');
      }
    } finally {
      if (mounted.current && requestId === openingRequest.current) {
        setOpeningId(null);
      }
    }
  };

  const finishChange = (message: string) => {
    if (mounted.current) {
      Keyboard.dismiss();
      setEditing(null);
      deleteConfirmationRef.current = null;
      setDeleteConfirmation(null);
      showToast(message);
      setReload(value => value + 1);
      try {
        onProductUpdated?.();
      } catch (error) {
        // A notification failure must not change a committed operation's result.
        console.error('[ShelfChef] Catalog change notification failed', error);
      }
    }
  };

  const saveProduct = async (input: UpdateCatalogProductInput): Promise<boolean> => {
    if (!editing || mutationRef.current || deleteConfirmationRef.current) {
      return false;
    }
    mutationRef.current = true;
    setPendingAction('save');
    setEditError(null);
    try {
      await repository.updateCatalogProduct(editing.id, input);
    } catch (error) {
      if (mounted.current) {
        setEditError(editErrorMessage(error));
        if (error instanceof CatalogProductUpdateError && error.code === 'not_found') {
          setReload(value => value + 1);
        }
      }
      return false;
    } finally {
      mutationRef.current = false;
      if (mounted.current) {
        setPendingAction(null);
      }
    }
    finishChange('Zapisano zmiany produktu.');
    return true;
  };

  const requestDelete = () => {
    if (!mounted.current || !editing || mutationRef.current || deleteConfirmationRef.current) {
      return;
    }
    Keyboard.dismiss();
    const confirmation = {productId: editing.id};
    deleteConfirmationRef.current = confirmation;
    setDeleteConfirmation(confirmation);
    setEditError(null);
  };

  const deleteProduct = async (confirmation: DeleteConfirmation | null): Promise<void> => {
    if (!confirmation || deleteConfirmationRef.current !== confirmation || !mounted.current ||
        editing?.id !== confirmation.productId || mutationRef.current) {
      return;
    }
    mutationRef.current = true;
    setPendingAction('delete');
    setEditError(null);
    try {
      await repository.deleteCatalogProduct(confirmation.productId);
    } catch (error) {
      if (mounted.current) {
        setEditError(deleteErrorMessage(error));
        if (error instanceof CatalogProductDeleteError && error.code === 'not_found') {
          setReload(value => value + 1);
        }
      }
      return;
    } finally {
      mutationRef.current = false;
      if (mounted.current) {
        setPendingAction(null);
      }
    }
    finishChange('Usunięto produkt z katalogu.');
  };

  const changeQuery = (value: string) => {
    openingRequest.current += 1;
    setOpeningId(null);
    setOpenError(null);
    setQuery(value);
  };

  return (
    <View style={[styles.screen, {paddingTop: insets.top + 2}]}>
      <View style={styles.header}>
        <Pressable
          testID="catalog-back"
          accessibilityRole="button"
          accessibilityLabel="Wróć do dodawania produktu"
          onPress={goBack}
          hitSlop={10}
          style={({pressed}) => [styles.backButton, pressed && styles.pressed]}>
          <Text style={styles.backText}>‹ Wróć</Text>
        </Pressable>
        <Text style={styles.title}>Katalog produktów</Text>
        <Text style={styles.subtitle}>Wszystkie zapisane produkty, również poza spiżarnią</Text>
      </View>
      <View style={styles.search}>
        <Search size={22} color={colors.textMuted} strokeWidth={2.1} />
        <TextInput
          testID="catalog-search"
          accessibilityLabel="Szukaj produktu po nazwie lub EAN"
          placeholder="Szukaj po nazwie lub EAN"
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={changeQuery}
          autoCorrect={false}
          style={styles.searchInput}
        />
      </View>
      {openError ? <View style={styles.feedback}><InlineFeedback feedback={{message: openError, tone: 'error'}} numberOfLines={0} /></View> : null}
      {loading ? (
        <View style={styles.status}><ActivityIndicator color={colors.success} /><Text style={styles.statusText}>Wczytuję katalog…</Text></View>
      ) : loadError ? (
        <View style={styles.status}>
          <InlineFeedback feedback={{message: loadError, tone: 'error'}} numberOfLines={0} />
          <Pressable testID="catalog-retry" accessibilityRole="button" onPress={() => setReload(value => value + 1)} style={styles.retry}>
            <Text style={styles.retryText}>Spróbuj ponownie</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          testID="catalog-list"
          data={products}
          keyExtractor={product => product.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.list, products.length === 0 && styles.emptyList]}
          ListEmptyComponent={
            <View style={styles.emptyCenter}>
              <EmptyState
                variant={query.trim() ? 'search' : 'products'}
                title={query.trim() ? 'Brak pasujących produktów' : 'Katalog jest pusty'}
                description={query.trim() ? 'Spróbuj innej nazwy lub EAN.' : 'Dodane produkty pojawią się tutaj automatycznie.'}
              />
            </View>
          }
          renderItem={({item}) => (
            <Pressable
              testID={`catalog-product-${item.id}`}
              accessibilityRole="button"
              accessibilityLabel={`Edytuj produkt: ${item.name}`}
              disabled={openingId !== null}
              onPress={() => { openProduct(item.id).catch(() => {}); }}
              style={({pressed}) => [styles.card, pressed && styles.pressed]}>
              {item.imageUrl ? <Image source={{uri: item.imageUrl}} style={styles.photo} /> : (
                <View style={[styles.photo, styles.placeholder]}><Package size={26} color={colors.textMuted} /></View>
              )}
              <View style={styles.productText}>
                <Text style={styles.productName}>{item.name}</Text>
                {item.brand || item.category ? <Text style={styles.metadata}>{[item.brand, item.category].filter(Boolean).join(' · ')}</Text> : null}
                <Text style={styles.ean}>{item.productEan ? `EAN: ${item.productEan}` : 'Bez EAN'}</Text>
              </View>
              {openingId === item.id ? <ActivityIndicator color={colors.success} /> : <ChevronRight size={20} color={colors.textMuted} />}
            </Pressable>
          )}
        />
      )}
      <CatalogProductEditModal
        product={editing}
        busy={pendingAction !== null}
        deleting={pendingAction === 'delete'}
        confirmingDelete={deleteConfirmation !== null}
        errorMessage={editError}
        onClose={closeEditor}
        onSave={saveProduct}
        onRequestDelete={requestDelete}
        onConfirmDelete={() => deleteProduct(deleteConfirmation)}
        onDraftChange={() => setEditError(null)}
      />
      <AppToast toast={toast} animatedValue={toastAnim} top={insets.top + 12} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.background},
  header: {paddingHorizontal: 16, paddingTop: 2, paddingBottom: 14},
  backButton: {alignSelf: 'flex-start', minHeight: 42, justifyContent: 'center', paddingVertical: 8, marginBottom: 10},
  backText: {color: colors.accent, fontSize: 17, fontWeight: '800'},
  title: {fontSize: 34, fontWeight: '900', color: colors.textPrimary},
  subtitle: {fontSize: 15, lineHeight: 21, color: colors.textSecondary, marginTop: 8},
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginBottom: 12,
    minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 14, backgroundColor: colors.surface,
    shadowColor: colors.shadow, shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: {width: 0, height: 4}, elevation: 2,
  },
  searchInput: {flex: 1, minHeight: 48, paddingVertical: 0, color: colors.textPrimary, fontSize: 16},
  list: {paddingHorizontal: shadowInsets.card.horizontal, paddingTop: shadowInsets.card.top, paddingBottom: shadowInsets.card.bottom, gap: 10},
  emptyList: {flexGrow: 1},
  status: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24},
  statusText: {fontSize: 14, lineHeight: 20, textAlign: 'center', color: colors.textSecondary},
  emptyCenter: {flex: 1, justifyContent: 'center'},
  card: {
    ...shadows.card,
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12,
    borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surface,
    minHeight: 92,
  },
  photo: {width: 68, height: 68, borderRadius: 8, resizeMode: 'cover', backgroundColor: colors.surfaceMuted},
  placeholder: {alignItems: 'center', justifyContent: 'center'},
  productText: {flex: 1, minWidth: 0},
  productName: {fontSize: 17, fontWeight: '900', color: colors.textPrimary},
  metadata: {fontSize: 13, color: colors.textSecondary, marginTop: 4},
  ean: {fontSize: 12, color: colors.textMuted, marginTop: 4},
  feedback: {marginHorizontal: 16},
  retry: {borderRadius: 8, backgroundColor: colors.success, paddingVertical: 12, paddingHorizontal: 20},
  retryText: {color: colors.successText, fontSize: 15, fontWeight: '700'},
  pressed: {opacity: 0.75},
});
