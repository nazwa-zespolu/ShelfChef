import React, {useEffect, useRef, useState} from 'react';
import {
  Image,
  KeyboardAvoidingView,
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
import type {CatalogProduct} from '../domain/types';
import type {UpdateCatalogProductInput} from '../infrastructure/ProductRepository';
import {selectProductPhoto, type ProductPhotoSource} from '../infrastructure/productPhotos';
import {DraggableBottomSheet} from '../shopping-lists/modals/DraggableBottomSheet';
import {colors} from '../theme/colors';

export function CatalogProductEditModal({
  product,
  busy,
  errorMessage,
  onClose,
  onSave,
  onDraftChange,
}: {
  product: CatalogProduct | null;
  busy: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSave: (input: UpdateCatalogProductInput) => void;
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
  const photoRequest = useRef(0);
  const photoPickingRef = useRef(false);

  useEffect(() => {
    setName(product?.name ?? '');
    setBrand(product?.brand ?? '');
    setCategory(product?.category ?? '');
    setImageUrl(product?.imageUrl ?? null);
    setPhotoError(null);
    setPhotoPicking(false);
    photoPickingRef.current = false;
    photoRequest.current += 1;
    return () => { photoRequest.current += 1; };
  }, [product]);

  const pickPhoto = async (source: ProductPhotoSource) => {
    if (!product || busy || photoPickingRef.current) {
      return;
    }
    const requestId = ++photoRequest.current;
    photoPickingRef.current = true;
    setPhotoPicking(true);
    setPhotoError(null);
    try {
      const storedUri = await selectProductPhoto(source);
      if (requestId === photoRequest.current && storedUri) {
        setImageUrl(storedUri);
        onDraftChange();
      }
    } catch (error) {
      if (requestId === photoRequest.current) {
        setPhotoError(error instanceof Error ? error.message : 'Nie udało się dodać zdjęcia');
      }
    } finally {
      if (requestId === photoRequest.current) {
        photoPickingRef.current = false;
        setPhotoPicking(false);
      }
    }
  };

  const submit = () => {
    if (busy || photoPickingRef.current || !name.trim()) {
      return;
    }
    onSave({
      name: name.trim(), brand: brand.trim() || null, category: category.trim() || null,
      ...(imageUrl !== product?.imageUrl ? {imageUrl} : {}),
    });
  };

  return (
    <DraggableBottomSheet
      visible={product != null}
      accessibilityLabel="Zamknij edycję produktu katalogowego"
      onClose={onClose}
      sheetStyle={[styles.sheet, {maxHeight: height * 0.9, paddingBottom: Math.max(insets.bottom, 12)}]}
      handleStyle={styles.handle}
      handleContent={<Text style={styles.title}>Edytuj produkt</Text>}>
      <KeyboardAvoidingView
        style={styles.form}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Math.max(insets.top, 12)}>
        <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
          <Text style={styles.notice}>Zmiany dotyczą wszystkich egzemplarzy tego produktu</Text>
          {product ? (
            <View style={styles.productHeader}>
              {imageUrl ? <Image source={{uri: imageUrl}} style={styles.photo} /> : null}
              <View style={styles.productText}>
                <Text style={styles.productName}>{product.name}</Text>
                <Text style={styles.metadata}>{product.productEan ? `EAN: ${product.productEan}` : 'Produkt bez EAN'}</Text>
              </View>
            </View>
          ) : null}
          <Text style={styles.label}>Zdjęcie produktu</Text>
          {!imageUrl ? <Text style={styles.metadata}>Brak zdjęcia</Text> : null}
          <View style={styles.photoActions}>
            <Pressable
              testID="catalog-edit-photo-camera"
              accessibilityRole="button"
              disabled={busy || photoPicking}
              onPress={() => { pickPhoto('camera').catch(() => {}); }}
              style={[styles.button, styles.cancel, (busy || photoPicking) && styles.disabled]}>
              <Text style={styles.cancelText}>Aparat</Text>
            </Pressable>
            <Pressable
              testID="catalog-edit-photo-library"
              accessibilityRole="button"
              disabled={busy || photoPicking}
              onPress={() => { pickPhoto('library').catch(() => {}); }}
              style={[styles.button, styles.cancel, (busy || photoPicking) && styles.disabled]}>
              <Text style={styles.cancelText}>Galeria</Text>
            </Pressable>
            {imageUrl ? (
              <Pressable
                testID="catalog-edit-photo-clear"
                accessibilityRole="button"
                disabled={busy || photoPicking}
                onPress={() => {
                  if (!busy && !photoPickingRef.current) {
                    setImageUrl(null);
                    setPhotoError(null);
                    onDraftChange();
                  }
                }}
                style={[styles.button, styles.cancel, (busy || photoPicking) && styles.disabled]}>
                <Text style={styles.cancelText}>Usuń zdjęcie</Text>
              </Pressable>
            ) : null}
          </View>
          {photoPicking ? <Text style={styles.metadata}>Przygotowuję zdjęcie…</Text> : null}
          {photoError ? <Text accessibilityRole="alert" style={styles.error}>{photoError}</Text> : null}
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
            value={brand}
            onChangeText={value => { setBrand(value); onDraftChange(); }}
            editable={!busy}
            style={styles.input}
          />
          <Text style={styles.label}>Kategoria (opcjonalnie)</Text>
          <TextInput
            testID="catalog-edit-category"
            accessibilityLabel="Kategoria"
            value={category}
            onChangeText={value => { setCategory(value); onDraftChange(); }}
            editable={!busy}
            style={styles.input}
          />
          {errorMessage ? <Text accessibilityRole="alert" style={styles.error}>{errorMessage}</Text> : null}
          <View style={styles.actions}>
            <Pressable
              testID="catalog-edit-cancel"
              accessibilityRole="button"
              disabled={busy}
              onPress={onClose}
              style={[styles.button, styles.cancel, busy && styles.disabled]}>
              <Text style={styles.cancelText}>Anuluj</Text>
            </Pressable>
            <Pressable
              testID="catalog-edit-save"
              accessibilityRole="button"
              disabled={busy || photoPicking || !name.trim()}
              onPress={submit}
              style={[styles.button, styles.save, (busy || photoPicking || !name.trim()) && styles.disabled]}>
              <Text style={styles.saveText}>{busy ? 'Zapisuję…' : 'Zapisz zmiany'}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
    padding: 12, borderRadius: 8, backgroundColor: colors.accentSoft,
    color: colors.textPrimary, fontSize: 14, lineHeight: 20, marginBottom: 16,
  },
  productHeader: {flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16},
  productText: {flex: 1},
  productName: {fontSize: 17, fontWeight: '800', color: colors.textPrimary},
  metadata: {fontSize: 13, color: colors.textSecondary, marginTop: 4},
  photo: {width: 64, height: 64, borderRadius: 8, resizeMode: 'cover', backgroundColor: colors.surfaceMuted},
  photoActions: {flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 14},
  label: {fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 6},
  input: {
    minHeight: 48, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1,
    borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surface,
    color: colors.textPrimary, fontSize: 16, marginBottom: 14,
  },
  error: {color: colors.danger, fontSize: 14, lineHeight: 20, marginBottom: 12},
  actions: {flexDirection: 'row', gap: 12, marginTop: 4, paddingBottom: 8},
  button: {flex: 1, minHeight: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center', padding: 10},
  cancel: {backgroundColor: colors.surfaceSubtle, borderWidth: 1, borderColor: colors.border},
  cancelText: {fontSize: 15, fontWeight: '700', color: colors.textPrimary},
  save: {backgroundColor: colors.success},
  saveText: {fontSize: 15, fontWeight: '700', color: colors.successText},
  disabled: {opacity: 0.5},
});
