import React, {useEffect, useRef} from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {colors} from '../theme/colors';

const WHEEL_ITEM_HEIGHT = 34;
const WHEEL_VISIBLE_ROWS = 3;
export const WHEEL_HEIGHT = WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_ROWS;

type WheelPickerProps = {
  label: string;
  values: number[];
  selectedValue: number;
  onValueChange: (value: number) => void;
};

export default function WheelPicker({
  label,
  values,
  selectedValue,
  onValueChange,
}: WheelPickerProps) {
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const selectedIndex = Math.max(values.indexOf(selectedValue), 0);
    scrollRef.current?.scrollTo({
      y: selectedIndex * WHEEL_ITEM_HEIGHT,
      animated: false,
    });
  }, [selectedValue, values]);

  const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const scrollY = event.nativeEvent.contentOffset.y;
    const index = Math.round(scrollY / WHEEL_ITEM_HEIGHT);
    const clampedIndex = Math.min(Math.max(index, 0), values.length - 1);
    const value = values[clampedIndex];
    if (value !== selectedValue) {
      onValueChange(value);
    }
  };

  return (
    <View style={styles.wheelColumn}>
      <Text style={styles.wheelLabel}>{label}</Text>
      <View style={styles.wheelFrame}>
        <View pointerEvents="none" style={styles.wheelSelectionLine} />
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          snapToInterval={WHEEL_ITEM_HEIGHT}
          decelerationRate="fast"
          onMomentumScrollEnd={handleScrollEnd}
          onScrollEndDrag={handleScrollEnd}
          contentContainerStyle={styles.wheelContent}>
          {values.map(value => {
            const isSelected = value === selectedValue;
            return (
              <View key={`${label}-${value}`} style={styles.wheelItem}>
                <Text style={[styles.wheelItemText, isSelected && styles.wheelItemTextSelected]}>
                  {String(value).padStart(2, '0')}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wheelColumn: {
    flex: 1,
    gap: 6,
  },
  wheelLabel: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  wheelFrame: {
    height: WHEEL_HEIGHT,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderDark,
    backgroundColor: colors.surfaceMid,
    overflow: 'hidden',
    position: 'relative',
  },
  wheelContent: {
    paddingVertical: WHEEL_ITEM_HEIGHT,
  },
  wheelSelectionLine: {
    position: 'absolute',
    left: 6,
    right: 6,
    top: WHEEL_ITEM_HEIGHT,
    height: WHEEL_ITEM_HEIGHT,
    borderRadius: 8,
    backgroundColor: 'rgba(71, 209, 107, 0.30)',
    zIndex: 1,
  },
  wheelItem: {
    height: WHEEL_ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelItemText: {
    color: colors.textMuted,
    fontSize: 16,
  },
  wheelItemTextSelected: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
});
