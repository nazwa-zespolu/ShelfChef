import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, BackHandler, FlatList, Image, Keyboard, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {ArrowLeft, ChevronRight, Package, Search} from 'lucide-react-native';
import {getProductRepository} from './app/services';
import {CatalogProductEditModal} from './components/CatalogProductEditModal';
import type {CatalogProduct} from './domain/types';
import {CatalogProductDeleteError, CatalogProductUpdateError, type UpdateCatalogProductInput} from './infrastructure/ProductRepository';
import {colors} from './theme/colors';

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
  const openingRequest = useRef(0);
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState<CatalogProduct | null>(null);
  const [pendingAction, setPendingAction] = useState<'save' | 'delete' | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
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
      setEditing(null);
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
    setSuccess(null);
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
      setSuccess(message);
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
    if (!editing || mutationRef.current) {
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

  const deleteProduct = async (id: string): Promise<void> => {
    if (!mounted.current || editing?.id !== id || mutationRef.current) {
      return;
    }
    mutationRef.current = true;
    setPendingAction('delete');
    setEditError(null);
    try {
      await repository.deleteCatalogProduct(id);
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
    setSuccess(null);
    setQuery(value);
  };

  return (
    <View style={[styles.screen, {paddingTop: Math.max(insets.top, 12)}]}>
      <View style={styles.header}>
        <Pressable testID="catalog-back" accessibilityRole="button" accessibilityLabel="Wróć do dodawania produktu" onPress={goBack} hitSlop={10}>
          <ArrowLeft size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Katalog produktów</Text>
      </View>
      <Text style={styles.subtitle}>Wszystkie zapisane produkty, również poza spiżarnią</Text>
      <View style={styles.search}>
        <Search size={20} color={colors.textMuted} />
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
      {success ? <Text accessibilityRole="alert" style={styles.success}>{success}</Text> : null}
      {openError ? <Text accessibilityRole="alert" style={styles.error}>{openError}</Text> : null}
      {loading ? (
        <View style={styles.status}><ActivityIndicator color={colors.success} /><Text style={styles.statusText}>Wczytuję katalog…</Text></View>
      ) : loadError ? (
        <View style={styles.status}>
          <Text accessibilityRole="alert" style={styles.error}>{loadError}</Text>
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
            <View style={styles.status}>
              <Package size={36} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>{query.trim() ? 'Brak pasujących produktów' : 'Katalog jest pusty'}</Text>
              <Text style={styles.statusText}>{query.trim() ? 'Spróbuj innej nazwy lub EAN.' : 'Dodane produkty pojawią się tutaj automatycznie.'}</Text>
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
        errorMessage={editError}
        onClose={closeEditor}
        onSave={saveProduct}
        onDelete={deleteProduct}
        onDraftChange={() => setEditError(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.background},
  header: {flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 12},
  title: {fontSize: 25, fontWeight: '900', color: colors.textPrimary, flex: 1},
  subtitle: {fontSize: 14, lineHeight: 20, color: colors.textSecondary, marginHorizontal: 16, marginBottom: 16},
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginBottom: 12,
    borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, backgroundColor: colors.surface,
  },
  searchInput: {flex: 1, minHeight: 48, color: colors.textPrimary, fontSize: 16},
  list: {paddingHorizontal: 16, paddingBottom: 16, gap: 10},
  emptyList: {flexGrow: 1},
  status: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24},
  statusText: {fontSize: 14, lineHeight: 20, textAlign: 'center', color: colors.textSecondary},
  emptyTitle: {fontSize: 19, fontWeight: '800', color: colors.textPrimary, textAlign: 'center'},
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12,
    borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surface,
  },
  photo: {width: 60, height: 60, borderRadius: 8, resizeMode: 'cover', backgroundColor: colors.surfaceMuted},
  placeholder: {alignItems: 'center', justifyContent: 'center'},
  productText: {flex: 1, minWidth: 0},
  productName: {fontSize: 16, fontWeight: '800', color: colors.textPrimary},
  metadata: {fontSize: 13, color: colors.textSecondary, marginTop: 4},
  ean: {fontSize: 12, color: colors.textMuted, marginTop: 4},
  error: {fontSize: 14, lineHeight: 20, color: colors.danger, marginHorizontal: 16, marginBottom: 12},
  success: {fontSize: 14, lineHeight: 20, color: colors.success, marginHorizontal: 16, marginBottom: 12},
  retry: {borderRadius: 8, backgroundColor: colors.success, paddingVertical: 12, paddingHorizontal: 20},
  retryText: {color: colors.successText, fontSize: 15, fontWeight: '700'},
  pressed: {opacity: 0.75},
});
