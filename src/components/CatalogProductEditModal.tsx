import React, {useEffect, useRef, useState} from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Package, Trash2} from 'lucide-react-native';
import type {CatalogProduct} from '../domain/types';
import type {UpdateCatalogProductInput} from '../infrastructure/ProductRepository';
import {ProductPhotoDraft, ProductPhotoPermissionError, type ProductPhotoSource} from '../infrastructure/productPhotos';
import {DraggableBottomSheet} from '../shopping-lists/modals/DraggableBottomSheet';
import {InlineFeedback} from '../shopping-lists/components/InlineFeedback';
import {colors} from '../theme/colors';
import {shadowGutters, shadowInsets, shadows} from '../theme/shadows';
import {ProductPhotoActions} from './ProductPhotoActions';

export function CatalogProductEditModal({
  product,
  busy,
  deleting,
  confirmingDelete,
  errorMessage,
  onClose,
  onSave,
  onRequestDelete,
  onConfirmDelete,
  onDraftChange,
}: {
  product: CatalogProduct | null;
  busy: boolean;
  deleting: boolean;
  confirmingDelete: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSave: (input: UpdateCatalogProductInput) => Promise<boolean>;
  onRequestDelete: () => void;
  onConfirmDelete: () => Promise<void>;
  onDraftChange: () => void;
}) {
  const insets = useSafeAreaInsets();
  const {height} = useWindowDimensions();
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [photoPicking, setPhotoPicking] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoPermissionBlocked, setPhotoPermissionBlocked] = useState(false);
  const photoRequest = useRef(0);
  const photoPickingRef = useRef(false);
  const photoDraft = useRef<ProductPhotoDraft | null>(null);

  useEffect(() => {
    const draft = new ProductPhotoDraft();
    photoDraft.current = draft;
    setName(product?.name ?? '');
    setBrand(product?.brand ?? '');
    setCategory(product?.category ?? '');
    setImageUrl(product?.imageUrl ?? null);
    setPhotoError(null);
    setPhotoPermissionBlocked(false);
    setPhotoPicking(false);
    photoPickingRef.current = false;
    photoRequest.current += 1;
    return () => {
      photoRequest.current += 1;
      draft.dispose().catch(error => { console.warn('[ShelfChef] Photo draft cleanup failed', error); });
    };
  }, [product]);

  const pickPhoto = async (source: ProductPhotoSource) => {
    if (!product || busy || photoPickingRef.current) {
      return;
    }
    const requestId = ++photoRequest.current;
    photoPickingRef.current = true;
    setPhotoPicking(true);
    setPhotoError(null);
    setPhotoPermissionBlocked(false);
    try {
      const storedUri = await photoDraft.current?.select(source);
      if (requestId === photoRequest.current && storedUri) {
        setImageUrl(storedUri);
        onDraftChange();
      }
    } catch (error) {
      if (requestId === photoRequest.current) {
        setPhotoError(error instanceof Error ? error.message : 'Nie udało się dodać zdjęcia');
        setPhotoPermissionBlocked(error instanceof ProductPhotoPermissionError && error.code === 'blocked');
      }
    } finally {
      if (requestId === photoRequest.current) {
        photoPickingRef.current = false;
        setPhotoPicking(false);
      }
    }
  };

  const openPhotoSettings = async () => {
    if (busy || photoPickingRef.current) {
      return;
    }
    const requestId = photoRequest.current;
    try {
      await Linking.openSettings();
    } catch {
      if (requestId === photoRequest.current) {
        setPhotoError('Nie udało się otworzyć ustawień aplikacji. Spróbuj ponownie.');
      }
    }
  };

  const submit = async () => {
    if (busy || photoPickingRef.current || !name.trim()) {
      return;
    }
    const input: UpdateCatalogProductInput = {
      name: name.trim(), brand: brand.trim() || null, category: category.trim() || null,
      ...(imageUrl !== product?.imageUrl ? {imageUrl} : {}),
    };
    await photoDraft.current?.save(() => onSave(input));
  };

  const requestDelete = () => {
    if (!product || busy || photoPickingRef.current) {
      return;
    }
    onRequestDelete();
  };

  return (
    <DraggableBottomSheet
      visible={product != null}
      accessibilityLabel={confirmingDelete ? 'Anuluj usuwanie produktu' : 'Zamknij edycję produktu katalogowego'}
      onClose={onClose}
      sheetStyle={[styles.sheet, {maxHeight: height * 0.9, paddingBottom: Math.max(insets.bottom, 12)}]}
      handleStyle={styles.handle}
      handleContent={<Text style={[styles.title, confirmingDelete && styles.confirmationTitle]}>{confirmingDelete ? 'Usunąć produkt?' : 'Edytuj produkt'}</Text>}>
      {confirmingDelete ? (
        <ScrollView style={[styles.form, shadowGutters.viewport]} contentContainerStyle={[shadowGutters.content, styles.confirmation]}>
          <Text testID="catalog-delete-product-name" style={styles.confirmationProduct}>{product?.name}</Text>
          <Text style={styles.confirmationDescription}>Produkt zostanie usunięty z lokalnego katalogu.</Text>
          <InlineFeedback feedback={errorMessage ? {message: errorMessage, tone: 'error'} : null} numberOfLines={0} />
          <View style={styles.actions}>
            <Pressable
              testID="catalog-delete-cancel"
              accessibilityRole="button"
              disabled={busy}
              onPress={onClose}
              style={({pressed}) => [styles.button, styles.cancel, busy && styles.disabled, pressed && styles.pressed]}>
              <Text style={styles.cancelText}>Anuluj</Text>
            </Pressable>
            <Pressable
              testID="catalog-delete-confirm"
              accessibilityRole="button"
              disabled={busy}
              onPress={() => { onConfirmDelete().catch(() => {}); }}
              style={({pressed}) => [styles.button, styles.confirmDelete, busy && styles.disabled, pressed && styles.pressed]}>
              <Text style={styles.saveText}>{deleting ? 'Usuwam…' : 'Usuń'}</Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : (
        <KeyboardAvoidingView
          style={styles.form}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Math.max(insets.top, 12)}>
          <ScrollView
            style={shadowGutters.viewport}
            contentContainerStyle={shadowGutters.content}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
            <Text style={styles.notice}>Zmiany dotyczą wszystkich egzemplarzy tego produktu</Text>
            {product ? (
              <View style={styles.productHeader}>
                {imageUrl ? <Image source={{uri: imageUrl}} style={styles.photo} /> : (
                  <View style={[styles.photo, styles.photoPlaceholder]}><Package size={28} color={colors.textMuted} /></View>
                )}
                <View style={styles.productText}>
                  <Text style={styles.productName}>{name.trim() || product.name}</Text>
                  {brand.trim() || category.trim() ? <Text style={styles.metadata}>{[brand.trim(), category.trim()].filter(Boolean).join(' · ')}</Text> : null}
                  <Text style={styles.metadata}>{product.productEan ? `EAN: ${product.productEan}` : 'Produkt bez EAN'}</Text>
                </View>
              </View>
            ) : null}
            <Text style={styles.label}>Zdjęcie produktu</Text>
            {!imageUrl ? <Text style={styles.metadata}>Brak zdjęcia</Text> : null}
            <View style={styles.photoActions}>
              <ProductPhotoActions
                testIDPrefix="catalog-edit-photo"
                hasPhoto={Boolean(imageUrl)}
                disabled={busy}
                picking={photoPicking}
                onTakePhoto={() => { pickPhoto('camera').catch(() => {}); }}
                onPickFromLibrary={() => { pickPhoto('library').catch(() => {}); }}
                onClear={() => {
                  if (!busy && !photoPickingRef.current) {
                    photoDraft.current?.clear().catch(error => { console.warn('[ShelfChef] Photo draft cleanup failed', error); });
                    setImageUrl(null);
                    setPhotoError(null);
                    setPhotoPermissionBlocked(false);
                    onDraftChange();
                  }
                }}
              />
            </View>
            <InlineFeedback feedback={photoError ? {message: photoError, tone: 'error'} : null} numberOfLines={0} />
            {photoPermissionBlocked ? (
              <Pressable
                testID="catalog-edit-photo-settings"
                accessibilityRole="button"
                disabled={busy || photoPicking}
                onPress={() => { openPhotoSettings().catch(() => {}); }}
                style={({pressed}) => [styles.textButton, styles.settings, (busy || photoPicking) && styles.disabled, pressed && styles.pressed]}>
                <Text style={styles.settingsText}>Otwórz ustawienia</Text>
              </Pressable>
            ) : null}
            <Text style={styles.label}>Nazwa produktu</Text>
            <TextInput
              testID="catalog-edit-name"
              accessibilityLabel="Nazwa produktu"
              value={name}
              onChangeText={value => { setName(value); onDraftChange(); }}
              editable={!busy}
              style={styles.input}
              autoCapitalize="sentences"
            />
            <Text style={styles.label}>Marka (opcjonalnie)</Text>
            <TextInput
              testID="catalog-edit-brand"
              accessibilityLabel="Marka"
              placeholder="Np. Barilla"
              placeholderTextColor={colors.textMuted}
              value={brand}
              onChangeText={value => { setBrand(value); onDraftChange(); }}
              editable={!busy}
              style={styles.input}
            />
            <Text style={styles.label}>Kategoria (opcjonalnie)</Text>
            <TextInput
              testID="catalog-edit-category"
              accessibilityLabel="Kategoria"
              placeholder="Np. Produkty suche"
              placeholderTextColor={colors.textMuted}
              value={category}
              onChangeText={value => { setCategory(value); onDraftChange(); }}
              editable={!busy}
              style={styles.input}
            />
            <InlineFeedback feedback={errorMessage ? {message: errorMessage, tone: 'error'} : null} numberOfLines={0} />
            <View style={styles.actions}>
              <Pressable
                testID="catalog-edit-cancel"
                accessibilityRole="button"
                disabled={busy}
                onPress={onClose}
                style={({pressed}) => [styles.button, styles.cancel, busy && styles.disabled, pressed && styles.pressed]}>
                <Text style={styles.cancelText}>Anuluj</Text>
              </Pressable>
              <Pressable
                testID="catalog-edit-save"
                accessibilityRole="button"
                disabled={busy || photoPicking || !name.trim()}
                onPress={() => { submit().catch(() => {}); }}
                style={({pressed}) => [styles.button, styles.save, (busy || photoPicking || !name.trim()) && styles.disabled, pressed && styles.pressed]}>
                <Text style={styles.saveText}>{busy && !deleting ? 'Zapisuję…' : 'Zapisz zmiany'}</Text>
              </Pressable>
            </View>
            <View style={styles.deleteSection}>
              <Pressable
                testID="catalog-edit-delete"
                accessibilityRole="button"
                disabled={busy || photoPicking}
                onPress={requestDelete}
                style={({pressed}) => [styles.textButton, (busy || photoPicking) && styles.disabled, pressed && styles.pressed]}>
                <Trash2 size={18} color={colors.danger} />
                <Text style={styles.deleteText}>Usuń produkt z katalogu</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </DraggableBottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {paddingTop: 4},
  handle: {
    alignSelf: 'stretch', width: 'auto', marginHorizontal: -16, minHeight: 52,
    paddingHorizontal: 16, paddingTop: 8,
  },
  title: {fontSize: 23, fontWeight: '900', color: colors.textPrimary, textAlign: 'center', marginTop: 8},
  form: {flexShrink: 1},
  notice: {
    color: colors.textSecondary, fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 14,
  },
  productHeader: {
    ...shadows.preview,
    minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18,
    padding: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  productText: {flex: 1, minWidth: 0},
  productName: {fontSize: 17, fontWeight: '900', color: colors.textPrimary},
  metadata: {fontSize: 13, color: colors.textSecondary, marginTop: 4},
  photo: {width: 68, height: 68, borderRadius: 8, resizeMode: 'cover', backgroundColor: colors.surfaceMuted},
  photoPlaceholder: {alignItems: 'center', justifyContent: 'center'},
  photoActions: {marginTop: 8, marginBottom: 14},
  settingsText: {fontSize: 14, fontWeight: '900', color: colors.accent},
  textButton: {minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 8},
  settings: {alignSelf: 'flex-start', marginBottom: 14},
  label: {fontSize: 14, fontWeight: '900', color: colors.textPrimary, marginBottom: 8},
  input: {
    ...shadows.control,
    minHeight: 48, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1,
    borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surface,
    color: colors.textPrimary, fontSize: 16, marginBottom: 14,
  },
  actions: {flexDirection: 'row', gap: 12, marginTop: 4, paddingBottom: 8},
  button: {flex: 1, minHeight: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center', padding: 10},
  cancel: {backgroundColor: colors.surfaceSubtle, borderWidth: 1, borderColor: colors.border},
  cancelText: {fontSize: 14, fontWeight: '900', color: colors.textPrimary},
  save: {flex: 2, minHeight: 54, backgroundColor: colors.success},
  saveText: {fontSize: 16, fontWeight: '900', color: colors.successText},
  deleteSection: {borderTopWidth: 1, borderTopColor: colors.border, marginTop: 16, paddingTop: 8, paddingBottom: 4},
  deleteText: {fontSize: 14, fontWeight: '900', color: colors.danger},
  confirmation: {paddingBottom: shadowInsets.card.bottom},
  confirmationTitle: {fontSize: 18, textAlign: 'left'},
  confirmationProduct: {fontSize: 17, fontWeight: '900', color: colors.textPrimary, marginBottom: 8},
  confirmationDescription: {fontSize: 15, lineHeight: 21, color: colors.textSecondary, marginBottom: 14},
  confirmDelete: {backgroundColor: colors.danger},
  pressed: {opacity: 0.78},
  disabled: {opacity: 0.45},
});
