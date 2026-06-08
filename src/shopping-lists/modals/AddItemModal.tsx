import React from 'react';
import {Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {Search} from 'lucide-react-native';
import type {
  CatalogProduct,
  ShoppingListIconColorKey,
  ShoppingListIconKey,
} from '../../domain/types';
import {DEFAULT_SHOPPING_LIST_ICON_COLOR_KEY} from '../../shoppingListIcons';
import {colors} from '../../theme/colors';
import {InlineFeedback, type FeedbackMessage} from '../components/InlineFeedback';
import {ShoppingIconAppearancePicker} from '../components/ShoppingIconAppearancePicker';
import {ShoppingItemIconBubble} from '../components/ShoppingItemIconBubble';
import {useKeyboardVisible} from '../hooks/useKeyboardVisible';
import {parseQuantityInput} from '../quantity';
import {DraggableBottomSheet} from './DraggableBottomSheet';

export function AddItemModal({
  visible,
  quantity,
  iconKey,
  iconColorKey,
  catalogQuery,
  catalogResults,
  selectedCatalog,
  feedback,
  busy,
  onChangeQuantity,
  onChangeIconKey,
  onChangeIconColorKey,
  onChangeCatalogQuery,
  onSelectCatalog,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  quantity: string;
  iconKey: ShoppingListIconKey;
  iconColorKey: ShoppingListIconColorKey;
  catalogQuery: string;
  catalogResults: CatalogProduct[];
  selectedCatalog: CatalogProduct | null;
  feedback: FeedbackMessage | null;
  busy: boolean;
  onChangeQuantity: (quantity: string) => void;
  onChangeIconKey: (iconKey: ShoppingListIconKey) => void;
  onChangeIconColorKey: (iconColorKey: ShoppingListIconColorKey) => void;
  onChangeCatalogQuery: (query: string) => void;
  onSelectCatalog: (product: CatalogProduct) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const quantityIsValid = parseQuantityInput(quantity) != null;
  const parsedQuantity = parseQuantityInput(quantity) ?? 1;
  const productName = catalogQuery.trim();
  const canSubmit = quantityIsValid && (selectedCatalog != null || productName.length > 0);
  const canDecrease = parsedQuantity > 1 && !busy;
  const keyboardVisible = useKeyboardVisible(!visible);

  return (
    <DraggableBottomSheet
      visible={visible}
      accessibilityLabel="Zamknij dodawanie produktu"
      onClose={onClose}
      sheetStyle={[styles.sheet, keyboardVisible && styles.sheetKeyboard]}
      handleStyle={styles.handleTouch}>
      <Text style={styles.title}>Dodaj produkt</Text>
      <Text style={styles.subtitle}>Wpisz nazwę albo wybierz produkt z katalogu</Text>
      <InlineFeedback feedback={feedback} />

      <Text style={styles.inputLabel}>Nazwa produktu</Text>
      <View style={styles.searchQuantityRow}>
        <View style={[styles.searchBox, styles.searchBoxCompact]}>
          <Search color={colors.textMuted} size={22} strokeWidth={2.1} />
          <TextInput
            value={catalogQuery}
            onChangeText={onChangeCatalogQuery}
            placeholder="Nazwa produktu"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
          />
        </View>
        <QuantityStepper
          value={parsedQuantity}
          canDecrease={canDecrease}
          busy={busy}
          onDecrease={() => onChangeQuantity(String(parsedQuantity - 1))}
          onIncrease={() => onChangeQuantity(String(parsedQuantity + 1))}
        />
      </View>

      {!keyboardVisible ? (
        <ShoppingIconAppearancePicker
          label="Ikona produktu"
          colorAccessibilityLabel="Kolor ikony produktu"
          iconKey={iconKey}
          iconColorKey={iconColorKey}
          onChangeIconKey={onChangeIconKey}
          onChangeIconColorKey={onChangeIconColorKey}
        />
      ) : null}

      <Text style={styles.sectionTitle}>Wyniki z katalogu</Text>
      {catalogResults.length > 0 ? (
        <ScrollView style={styles.results} keyboardShouldPersistTaps="handled">
          {catalogResults.map(product => {
            const active = selectedCatalog?.id === product.id;
            return (
              <View key={product.id} style={[styles.catalogCard, active && styles.catalogCardActive]}>
                <ShoppingItemIconBubble
                  iconKey="box"
                  iconColorKey={DEFAULT_SHOPPING_LIST_ICON_COLOR_KEY}
                  imageUrl={product.imageUrl}
                />
                <View style={styles.productText}>
                  <Text style={styles.productName} numberOfLines={1}>{product.name}</Text>
                  <Text style={styles.productMeta}>
                    {product.kind === 'specific' ? 'Produkt z EAN' : 'Produkt z katalogu'}
                  </Text>
                </View>
                <Pressable
                  disabled={busy}
                  onPress={() => onSelectCatalog(product)}
                  style={({pressed}) => [
                    styles.selectButton,
                    active && styles.selectButtonActive,
                    busy && styles.disabled,
                    pressed && styles.pressed,
                  ]}>
                  <Text style={[styles.selectButtonText, active && styles.selectButtonTextActive]}>
                    {active ? 'Wybrano' : 'Wybierz'}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
      ) : (
        <View style={styles.emptyResults}>
          <Text style={styles.emptyText}>
            {productName ? 'Brak wyników katalogu' : 'Wpisz nazwę produktu'}
          </Text>
        </View>
      )}

      {!quantityIsValid ? (
        <Text style={styles.fieldError}>Ilość musi być liczbą większą od 0</Text>
      ) : null}
      <Pressable
        disabled={busy || !canSubmit}
        onPress={onSubmit}
        style={({pressed}) => [
          styles.submitButton,
          (busy || !canSubmit) && styles.disabled,
          pressed && styles.pressed,
        ]}>
        <Text style={styles.submitButtonText}>Dodaj produkt</Text>
      </Pressable>
    </DraggableBottomSheet>
  );
}

function QuantityStepper({
  value,
  canDecrease,
  busy,
  onDecrease,
  onIncrease,
}: {
  value: number;
  canDecrease: boolean;
  busy: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <View style={styles.quantityStepper}>
      <Pressable
        disabled={!canDecrease}
        onPress={onDecrease}
        style={({pressed}) => [
          styles.stepButton,
          !canDecrease && styles.disabled,
          pressed && styles.pressed,
        ]}>
        <Text style={styles.stepText}>−</Text>
      </Pressable>
      <Text style={styles.quantityText}>{value}</Text>
      <Pressable
        disabled={busy}
        onPress={onIncrease}
        style={({pressed}) => [
          styles.stepButton,
          busy && styles.disabled,
          pressed && styles.pressed,
        ]}>
        <Text style={styles.stepText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingTop: 4,
    maxHeight: '98%',
  },
  sheetKeyboard: {
    height: '94%',
    maxHeight: '94%',
  },
  handleTouch: {
    alignSelf: 'stretch',
    width: 'auto',
    minHeight: 44,
    marginHorizontal: -16,
    marginTop: -4,
    marginBottom: -8,
    paddingHorizontal: 16,
    justifyContent: 'flex-start',
    paddingTop: 10,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 23,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 0,
    marginBottom: 4,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 10,
  },
  inputLabel: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 8,
  },
  searchQuantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  searchBox: {
    minHeight: 52,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
    shadowColor: colors.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 3},
    elevation: 1,
  },
  searchBoxCompact: {
    flex: 1,
    marginBottom: 0,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 15,
    paddingVertical: 0,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 10,
  },
  results: {
    maxHeight: 430,
  },
  catalogCard: {
    minHeight: 72,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: colors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 4},
    elevation: 2,
  },
  catalogCardActive: {
    borderColor: colors.accent,
  },
  productText: {
    flex: 1,
    minWidth: 0,
  },
  productName: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '900',
  },
  productMeta: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 3,
  },
  selectButton: {
    minHeight: 40,
    minWidth: 84,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  selectButtonActive: {
    backgroundColor: colors.accentSoft,
  },
  selectButtonText: {
    color: colors.success,
    fontSize: 13,
    fontWeight: '900',
  },
  selectButtonTextActive: {
    color: colors.accent,
  },
  emptyResults: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  quantityStepper: {
    height: 52,
    minWidth: 110,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepButton: {
    width: 36,
    height: 50,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSubtle,
  },
  stepText: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '900',
  },
  quantityText: {
    width: 36,
    textAlign: 'center',
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '900',
  },
  fieldError: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '700',
    marginTop: -4,
    marginBottom: 10,
  },
  submitButton: {
    minHeight: 54,
    borderRadius: 8,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  submitButtonText: {
    color: colors.successText,
    fontSize: 16,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.78,
  },
  disabled: {
    opacity: 0.45,
  },
});
