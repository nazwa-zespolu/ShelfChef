import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {ArrowLeft, CalendarDays} from 'lucide-react-native';
import {colors} from '../theme/colors';

type ExpiryFilterButtonProps = {
  active: boolean;
  count: number;
  hasExpiredItems: boolean;
  onPress: () => void;
};

function productCountLabel(count: number) {
  if (count === 1) {
    return '1 produkt';
  }
  if (count > 1 && count < 5) {
    return `${count} produkty`;
  }
  return `${count} produktów`;
}

export function ExpiryFilterButton({
  active,
  count,
  hasExpiredItems,
  onPress,
}: ExpiryFilterButtonProps) {
  const accessibilityLabel = active
    ? 'Wróć do spiżarni'
    : count === 0
      ? 'Pilne terminy, brak produktów wymagających uwagi'
      : `Pilne terminy, ${productCountLabel(count)}`;

  return (
    <Pressable
      testID="expiry-filter-button"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{selected: active}}
      onPress={onPress}
      style={({pressed}) => [
        styles.tile,
        active && styles.tileActive,
        pressed && styles.pressed,
      ]}>
      {active ? (
        <ArrowLeft color={colors.textPrimary} size={22} strokeWidth={2.4} />
      ) : (
        <View style={styles.iconWrap}>
          <View
            style={[
              styles.iconSurface,
              hasExpiredItems
                ? styles.iconSurfaceExpired
                : count > 0
                  ? styles.iconSurfaceWarning
                  : styles.iconSurfaceClear,
            ]}>
            <CalendarDays color={colors.successText} size={19} strokeWidth={2.3} />
          </View>
          <View
            style={[
              styles.countBadge,
              hasExpiredItems
                ? styles.countBadgeExpired
                : count > 0
                  ? styles.countBadgeWarning
                  : styles.countBadgeClear,
            ]}>
            <Text style={styles.countText}>{count > 9 ? '9+' : count}</Text>
          </View>
        </View>
      )}
      <Text style={styles.label} numberOfLines={1}>
        {active ? 'Wróć' : 'Terminy'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: 68,
    minHeight: 58,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 5,
    shadowColor: colors.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 3},
    elevation: 2,
  },
  tileActive: {
    backgroundColor: colors.surfaceSubtle,
  },
  iconWrap: {
    position: 'relative',
  },
  iconSurface: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSurfaceExpired: {
    backgroundColor: colors.danger,
  },
  iconSurfaceWarning: {
    backgroundColor: colors.warning,
  },
  iconSurfaceClear: {
    backgroundColor: colors.success,
  },
  countBadge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeExpired: {
    backgroundColor: colors.danger,
  },
  countBadgeWarning: {
    backgroundColor: colors.warning,
  },
  countBadgeClear: {
    backgroundColor: colors.success,
  },
  countText: {
    color: colors.successText,
    fontSize: 10,
    fontWeight: '900',
  },
  label: {
    color: colors.textPrimary,
    fontSize: 10,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.78,
  },
});
