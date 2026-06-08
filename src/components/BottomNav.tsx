import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Astroid, List, ScanBarcode, ShelvingUnit} from 'lucide-react-native';
import {colors} from '../theme/colors';

export type AppTab = 'pantry' | 'scan' | 'shopping' | 'recipes';

type BottomNavProps = {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
};

type NavIcon = React.ComponentType<{
  color?: string;
  size?: number;
  strokeWidth?: number;
}>;

const TAB_ITEMS: {key: AppTab; label: string; Icon: NavIcon}[] = [
  {key: 'pantry', label: 'Spiżarnia', Icon: ShelvingUnit},
  {key: 'scan', label: 'Dodaj produkt', Icon: ScanBarcode},
  {key: 'shopping', label: 'Listy zakupów', Icon: List},
  {key: 'recipes', label: 'Przepisy AI', Icon: Astroid},
];

export default function BottomNav({activeTab, onTabChange}: BottomNavProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, {paddingBottom: Math.max(insets.bottom, 8)}]}>
      <View style={styles.bar}>
        {TAB_ITEMS.map(item => {
          const active = item.key === activeTab;
          const Icon = item.Icon;
          return (
            <Pressable
              key={item.key}
              onPress={() => onTabChange(item.key)}
              style={({pressed}) => [styles.tab, active && styles.tabActive, pressed && styles.tabPressed]}>
              <Icon
                color={active ? colors.tabActive : colors.tabInactive}
                size={21}
                strokeWidth={2.2}
              />
              <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.tabBackground,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 10,
    paddingTop: 8,
  },
  bar: {
    flexDirection: 'row',
    gap: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 8,
    gap: 2,
  },
  tabActive: {
    backgroundColor: colors.accentSoft,
  },
  tabPressed: {
    opacity: 0.8,
  },
  label: {
    fontSize: 10,
    color: colors.tabInactive,
    fontWeight: '700',
  },
  labelActive: {
    color: colors.tabActive,
  },
});
