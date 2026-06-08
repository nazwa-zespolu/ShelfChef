import React from 'react';
import {Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {Pencil} from 'lucide-react-native';
import type {
  AutoShoppingListItemState,
  ShoppingListIconColorKey,
  ShoppingListIconKey,
} from '../../domain/types';
import {colors} from '../../theme/colors';
import {InlineFeedback, type FeedbackMessage} from '../components/InlineFeedback';
import {ShoppingIconAppearancePicker} from '../components/ShoppingIconAppearancePicker';
import {ShoppingItemIconBubble} from '../components/ShoppingItemIconBubble';
import {DraggableBottomSheet} from './DraggableBottomSheet';

export function EditItemModal({
  item,
  name,
  iconKey,
  iconColorKey,
  feedback,
  busy,
  onChangeName,
  onChangeIconKey,
  onChangeIconColorKey,
  onClose,
  onSubmit,
}: {
  item: AutoShoppingListItemState | null;
  name: string;
  iconKey: ShoppingListIconKey;
  iconColorKey: ShoppingListIconColorKey;
  feedback: FeedbackMessage | null;
  busy: boolean;
  onChangeName: (name: string) => void;
  onChangeIconKey: (iconKey: ShoppingListIconKey) => void;
  onChangeIconColorKey: (iconColorKey: ShoppingListIconColorKey) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <DraggableBottomSheet
      visible={item != null}
      accessibilityLabel="Zamknij edycję produktu"
      onClose={onClose}
      sheetStyle={styles.sheet}
      handleStyle={styles.handleTouch}>
      <Text style={styles.title}>Edytuj produkt</Text>
      <Text style={styles.subtitle}>Zmień nazwę, ikonę lub kolor produktu tekstowego</Text>
      <InlineFeedback feedback={feedback} />

      <View style={styles.previewCard}>
        <ShoppingItemIconBubble iconKey={iconKey} iconColorKey={iconColorKey} />
        <View style={styles.productText}>
          <Text style={styles.productName} numberOfLines={1}>
            {name.trim() || 'Nazwa produktu'}
          </Text>
          <Text style={styles.productMeta}>Produkt tekstowy</Text>
        </View>
      </View>

      <Text style={styles.inputLabel}>Nazwa produktu</Text>
      <View style={styles.searchBox}>
        <Pencil color={colors.textMuted} size={20} strokeWidth={2.1} />
        <TextInput
          value={name}
          onChangeText={onChangeName}
          placeholder="Nazwa produktu"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
        />
      </View>

      <ShoppingIconAppearancePicker
        label="Ikona produktu"
        colorAccessibilityLabel="Kolor ikony produktu"
        iconKey={iconKey}
        iconColorKey={iconColorKey}
        onChangeIconKey={onChangeIconKey}
        onChangeIconColorKey={onChangeIconColorKey}
      />

      <Pressable
        disabled={busy || name.trim().length === 0}
        onPress={onSubmit}
        style={({pressed}) => [
          styles.submitButton,
          (busy || name.trim().length === 0) && styles.disabled,
          pressed && styles.pressed,
        ]}>
        <Text style={styles.submitButtonText}>Zapisz zmiany</Text>
      </Pressable>
    </DraggableBottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingTop: 4,
    maxHeight: '98%',
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
  previewCard: {
    minHeight: 74,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: colors.shadow,
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 5},
    elevation: 3,
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
  inputLabel: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 8,
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
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 15,
    paddingVertical: 0,
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
