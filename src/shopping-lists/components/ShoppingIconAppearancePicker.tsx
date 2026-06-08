import React from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import type {ShoppingListIconColorKey, ShoppingListIconKey} from '../../domain/types';
import {
  getShoppingListIconColorDefinition,
  SHOPPING_LIST_ICON_COLORS,
  SHOPPING_LIST_ICONS,
} from '../../shoppingListIcons';
import {colors} from '../../theme/colors';

export function ShoppingIconAppearancePicker({
  label,
  colorAccessibilityLabel,
  iconKey,
  iconColorKey,
  onChangeIconKey,
  onChangeIconColorKey,
}: {
  label: string;
  colorAccessibilityLabel: string;
  iconKey: ShoppingListIconKey;
  iconColorKey: ShoppingListIconColorKey;
  onChangeIconKey: (iconKey: ShoppingListIconKey) => void;
  onChangeIconColorKey: (iconColorKey: ShoppingListIconColorKey) => void;
}) {
  const selectedColor = getShoppingListIconColorDefinition(iconColorKey);

  return (
    <>
      <View style={styles.headerRow}>
        <Text style={styles.headerLabel}>{label}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.colorPickerRow}
          style={styles.colorPicker}>
          {SHOPPING_LIST_ICON_COLORS.map(colorOption => {
            const active = colorOption.key === iconColorKey;
            return (
              <Pressable
                key={colorOption.key}
                onPress={() => onChangeIconColorKey(colorOption.key)}
                accessibilityLabel={`${colorAccessibilityLabel}: ${colorOption.label}`}
                style={({pressed}) => [
                  styles.colorSwatchShadow,
                  active && styles.colorSwatchShadowActive,
                  pressed && styles.pressed,
                ]}>
                <View
                  style={[
                    styles.colorSwatch,
                    {
                      borderColor: active ? colorOption.color : colors.border,
                      backgroundColor: active ? colorOption.background : colors.surface,
                    },
                    active && styles.colorSwatchActive,
                  ]}>
                  <View style={[styles.colorSwatchInner, {backgroundColor: colorOption.color}]} />
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.iconPickerRow}>
        {SHOPPING_LIST_ICONS.map(icon => {
          const active = icon.key === iconKey;
          const Icon = icon.Icon;
          return (
            <Pressable
              key={icon.key}
              onPress={() => onChangeIconKey(icon.key)}
              style={({pressed}) => [
                styles.iconChoiceShadow,
                active && styles.iconChoiceShadowActive,
                pressed && styles.pressed,
              ]}>
              <View
                style={[
                  styles.iconChoice,
                  active && styles.iconChoiceActive,
                  active && {
                    borderColor: selectedColor.color,
                    backgroundColor: selectedColor.background,
                  },
                ]}>
                <Icon
                  color={active ? selectedColor.color : colors.textSecondary}
                  size={27}
                  strokeWidth={2.1}
                />
                <Text
                  style={[
                    styles.iconChoiceLabel,
                    active && styles.iconChoiceLabelActive,
                    active && {color: selectedColor.color},
                  ]}
                  numberOfLines={1}>
                  {icon.label}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  headerLabel: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '900',
  },
  colorPicker: {
    flexShrink: 1,
    maxWidth: 210,
  },
  colorPickerRow: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    paddingRight: 2,
  },
  colorSwatchShadow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: {width: 0, height: 3},
    elevation: 2,
  },
  colorSwatchShadowActive: {
    shadowOpacity: 0.08,
    elevation: 3,
  },
  colorSwatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorSwatchActive: {
    borderWidth: 2,
  },
  colorSwatchInner: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  iconPickerRow: {
    gap: 10,
    paddingTop: 2,
    paddingBottom: 6,
    paddingRight: 16,
  },
  iconChoiceShadow: {
    width: 68,
    minHeight: 72,
    borderRadius: 8,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 5},
    elevation: 2,
  },
  iconChoiceShadowActive: {
    shadowOpacity: 0.09,
    elevation: 3,
  },
  iconChoice: {
    width: 68,
    minHeight: 72,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    gap: 5,
  },
  iconChoiceActive: {
    borderColor: colors.success,
    backgroundColor: colors.accentSoft,
  },
  iconChoiceLabel: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '800',
    maxWidth: '100%',
  },
  iconChoiceLabelActive: {
    color: colors.accent,
  },
  pressed: {
    opacity: 0.78,
  },
});
