import React from 'react';
import {Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {ClipboardList, RefreshCcw} from 'lucide-react-native';
import type {
  ShoppingListIconColorKey,
  ShoppingListIconKey,
  ShoppingListType,
} from '../../domain/types';
import {
  getShoppingListIconColorDefinition,
  getShoppingListIconDefinition,
} from '../../shoppingListIcons';
import {colors} from '../../theme/colors';
import {InlineFeedback, type FeedbackMessage} from '../components/InlineFeedback';
import {ShoppingIconAppearancePicker} from '../components/ShoppingIconAppearancePicker';
import {DraggableBottomSheet} from './DraggableBottomSheet';

export function ListFormModal({
  visible,
  mode,
  name,
  type,
  iconKey,
  iconColorKey,
  feedback,
  busy,
  onChangeName,
  onChangeType,
  onChangeIconKey,
  onChangeIconColorKey,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  mode: 'create' | 'edit';
  name: string;
  type: ShoppingListType;
  iconKey: ShoppingListIconKey;
  iconColorKey: ShoppingListIconColorKey;
  feedback: FeedbackMessage | null;
  busy: boolean;
  onChangeName: (name: string) => void;
  onChangeType: (type: ShoppingListType) => void;
  onChangeIconKey: (iconKey: ShoppingListIconKey) => void;
  onChangeIconColorKey: (iconColorKey: ShoppingListIconColorKey) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const isEditing = mode === 'edit';
  const selectedIcon = getShoppingListIconDefinition(iconKey);
  const selectedColor = getShoppingListIconColorDefinition(iconColorKey);
  const SelectedIcon = selectedIcon.Icon;

  return (
    <DraggableBottomSheet
      visible={visible}
      accessibilityLabel={isEditing ? 'Zamknij ustawienia listy' : 'Zamknij tworzenie listy'}
      onClose={onClose}
      sheetStyle={styles.sheet}
      handleStyle={styles.handleTouch}>
      <Text style={styles.title}>
        {isEditing ? 'Ustawienia listy' : 'Nowa lista zakupów'}
      </Text>
      <Text style={styles.subtitle}>
        {isEditing ? 'Zmień nazwę, ikonę i kolor listy.' : 'Nadaj nazwę i wybierz typ listy.'}
      </Text>
      <InlineFeedback feedback={feedback} />
      <View style={styles.preview}>
        <View style={[styles.previewIcon, {backgroundColor: selectedColor.background}]}>
          <SelectedIcon color={selectedColor.color} size={30} strokeWidth={2.2} />
        </View>
        <View style={styles.rowText}>
          <Text style={styles.previewTitle} numberOfLines={1}>
            {name.trim() || 'Nazwa listy'}
          </Text>
          <Text style={styles.previewMeta}>
            {type === 'manual' ? 'Lista zakupów' : 'Lista uzupełniania'}
          </Text>
        </View>
      </View>
      <Text style={styles.fieldLabel}>Nazwa listy</Text>
      <TextInput
        value={name}
        onChangeText={onChangeName}
        placeholder="Np. zakupy na weekend"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
      />
      {!isEditing ? (
        <>
          <Text style={styles.fieldLabel}>Typ listy</Text>
          <View style={styles.typeRow}>
            {(['manual', 'auto'] as ShoppingListType[]).map(option => {
              const active = type === option;
              const TypeIcon = option === 'manual' ? ClipboardList : RefreshCcw;
              const typeColor = option === 'manual' ? colors.accent : colors.warning;
              return (
                <Pressable
                  key={option}
                  onPress={() => onChangeType(option)}
                  style={({pressed}) => [
                    styles.typeOption,
                    active && styles.typeOptionActive,
                    active && (
                      option === 'manual'
                        ? styles.typeOptionManualActive
                        : styles.typeOptionAutoActive
                    ),
                    pressed && styles.pressed,
                  ]}>
                  <TypeIcon
                    color={active ? typeColor : colors.textSecondary}
                    size={20}
                    strokeWidth={2.2}
                  />
                  <Text
                    style={[
                      styles.typeTitle,
                      active && (
                        option === 'manual'
                          ? styles.typeTitleManualActive
                          : styles.typeTitleAutoActive
                      ),
                    ]}>
                    {option === 'manual' ? 'Manualna' : 'Auto'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}
      <ShoppingIconAppearancePicker
        label="Ikona listy"
        colorAccessibilityLabel="Kolor ikony"
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
        <Text style={styles.submitButtonText}>
          {isEditing ? 'Zapisz zmiany' : 'Utwórz listę'}
        </Text>
      </Pressable>
    </DraggableBottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    maxHeight: '90%',
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
    fontSize: 26,
    fontWeight: '900',
    marginBottom: 6,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 15,
    marginBottom: 18,
  },
  preview: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 12,
    marginBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: colors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 4},
    elevation: 2,
  },
  previewIcon: {
    width: 62,
    height: 62,
    borderRadius: 8,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  previewTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '900',
  },
  previewMeta: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 4,
  },
  fieldLabel: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 10,
    shadowColor: colors.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 3},
    elevation: 1,
  },
  typeRow: {
    minHeight: 50,
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: 16,
    padding: 2,
    gap: 4,
    shadowColor: colors.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 3},
    elevation: 1,
  },
  typeOption: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 10,
  },
  typeOptionActive: {
    borderWidth: 2,
    margin: -3,
    zIndex: 2,
  },
  typeOptionManualActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  typeOptionAutoActive: {
    borderColor: colors.warning,
    backgroundColor: colors.warningSoft,
  },
  typeTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '900',
  },
  typeTitleManualActive: {
    color: colors.accent,
  },
  typeTitleAutoActive: {
    color: colors.warning,
  },
  submitButton: {
    borderRadius: 8,
    backgroundColor: colors.success,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
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
