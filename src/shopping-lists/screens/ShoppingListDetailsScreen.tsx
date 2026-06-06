import React from 'react';
import {
  type DimensionValue,
  FlatList,
  type ListRenderItem,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {Check, Lock, Plus, RefreshCcw, Search, Settings, Unlock} from 'lucide-react-native';
import type {AutoShoppingListItemState, ShoppingListSummary} from '../../domain/types';
import {colors} from '../../theme/colors';
import {EmptyState} from '../components/EmptyState';

type ShoppingListDetailsScreenProps = {
  list: ShoppingListSummary;
  items: AutoShoppingListItemState[];
  filteredItems: AutoShoppingListItemState[];
  itemSearch: string;
  busy: boolean;
  bottomInset: number;
  renderManualItem: ListRenderItem<AutoShoppingListItemState>;
  renderAutoItem: ListRenderItem<AutoShoppingListItemState>;
  onBack: () => void;
  onEditList: () => void;
  onChangeItemSearch: (value: string) => void;
  onAddItem: () => void;
  onCompletePurchase: () => void;
  onToggleLock: () => void;
};

function pluralizeItems(count: number) {
  if (count === 1) {
    return '1 pozycja';
  }
  if (count > 1 && count < 5) {
    return `${count} pozycje`;
  }
  return `${count} pozycji`;
}

function purchasedLabel(count: number) {
  if (count === 1) {
    return '1 kupiona';
  }
  return `${count} kupionych`;
}

export function ShoppingListDetailsScreen({
  list,
  items,
  filteredItems,
  itemSearch,
  busy,
  bottomInset,
  renderManualItem,
  renderAutoItem,
  onBack,
  onEditList,
  onChangeItemSearch,
  onAddItem,
  onCompletePurchase,
  onToggleLock,
}: ShoppingListDetailsScreenProps) {
  const purchasedCount = items.filter(item => item.effectiveStatus === 'purchased').length;
  const totalCount = items.length;

  if (list.type === 'manual') {
    const progress = totalCount > 0 ? purchasedCount / totalCount : 0;
    const progressPercent = `${Math.round(progress * 100)}%` as DimensionValue;

    return (
      <View style={styles.content}>
        <View style={styles.detailsHero}>
          <View style={styles.detailsTopRow}>
            <BackButton onPress={onBack} />
            <View style={styles.manualTypeBadge}>
              <Text style={styles.manualTypeBadgeText}>Manualna</Text>
            </View>
          </View>
          <DetailsTitle name={list.name} onEditList={onEditList} />
          <Text style={styles.detailsMeta}>
            {pluralizeItems(totalCount)} · {purchasedLabel(purchasedCount)}
          </Text>
          <Progress value={progressPercent} />
          <ItemSearch value={itemSearch} onChange={onChangeItemSearch} />
        </View>
        <FlatList
          data={filteredItems}
          keyExtractor={item => item.id}
          contentContainerStyle={[
            styles.itemsContent,
            filteredItems.length === 0 && styles.emptyContent,
          ]}
          renderItem={renderManualItem}
          ListEmptyComponent={
            items.length === 0 ? (
              <EmptyState
                title="Dodaj pierwszy produkt"
                description="Przesuń w prawo, żeby oznaczyć jako kupiony. W lewo, żeby usunąć."
              />
            ) : (
              <EmptyState title="Brak pasujących produktów" />
            )
          }
        />
        <View style={[styles.bottomBar, {paddingBottom: bottomInset + 10}]}>
          <AddButton onPress={onAddItem} />
          <Pressable
            disabled={purchasedCount === 0 || busy}
            onPress={onCompletePurchase}
            style={({pressed}) => [
              styles.actionButton,
              (purchasedCount === 0 || busy) && styles.disabled,
              pressed && styles.pressed,
            ]}>
            <Check color={colors.successText} size={22} strokeWidth={2.3} />
            <Text style={styles.actionButtonText}>Finalizuj</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const missingCount = items.filter(item => item.missingQuantity > 0).length;
  const coveredCount = Math.max(0, totalCount - missingCount);
  const progress = totalCount > 0 ? coveredCount / totalCount : 0;
  const progressPercent = `${Math.round(progress * 100)}%` as DimensionValue;
  const AutoLockIcon = list.isLocked ? Unlock : Lock;

  return (
    <View style={styles.content}>
      <View style={styles.detailsHero}>
        <View style={styles.detailsTopRow}>
          <BackButton onPress={onBack} />
          <View style={styles.autoBadgeRow}>
            <View style={styles.autoTypeBadge}>
              <Text style={styles.autoTypeBadgeText}>Auto</Text>
            </View>
            <View style={styles.autoLockBadge}>
              <Text style={styles.autoLockBadgeText}>
                {list.isLocked ? 'Zablokowana' : 'Aktywna'}
              </Text>
            </View>
          </View>
        </View>
        <DetailsTitle name={list.name} onEditList={onEditList} />
        <Text style={styles.detailsMeta}>
          {pluralizeItems(totalCount)} · {missingCount === 1 ? '1 do uzupełnienia' : `${missingCount} do uzupełnienia`}
        </Text>
        <Progress value={progressPercent} />
        <View style={styles.autoStatusRow}>
          <RefreshCcw color={colors.accent} size={21} strokeWidth={2.1} />
          <Text style={styles.autoStatusText}>
            {list.isLocked ? 'Aktualizacja wstrzymana' : 'Aktualizuje się z zapasów'}
          </Text>
        </View>
        <ItemSearch value={itemSearch} onChange={onChangeItemSearch} />
      </View>
      <FlatList
        data={filteredItems}
        keyExtractor={item => item.id}
        contentContainerStyle={[
          styles.itemsContent,
          filteredItems.length === 0 && styles.emptyContent,
        ]}
        renderItem={renderAutoItem}
        ListEmptyComponent={
          items.length === 0 ? (
            <EmptyState
              title="Dodaj minimum zapasów"
              description="Dodaj produkty, które chcesz mieć w zapasach. Braki pojawią się w Do uzupełnienia."
            />
          ) : (
            <EmptyState title="Brak pasujących produktów" />
          )
        }
      />
      <View style={[styles.bottomBar, {paddingBottom: bottomInset + 10}]}>
        <AddButton onPress={onAddItem} />
        <Pressable
          disabled={busy}
          onPress={onToggleLock}
          style={({pressed}) => [
            styles.actionButton,
            busy && styles.disabled,
            pressed && styles.pressed,
          ]}>
          <AutoLockIcon color={colors.successText} size={21} strokeWidth={2.2} />
          <Text style={styles.actionButtonText}>
            {list.isLocked ? 'Odblokuj' : 'Zablokuj'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function BackButton({onPress}: {onPress: () => void}) {
  return (
    <Pressable
      onPress={onPress}
      style={({pressed}) => [styles.backButton, pressed && styles.pressed]}
      hitSlop={10}>
      <Text style={styles.backText}>‹ Wróć</Text>
    </Pressable>
  );
}

function DetailsTitle({name, onEditList}: {name: string; onEditList: () => void}) {
  return (
    <View style={styles.titleRow}>
      <Text style={styles.title} numberOfLines={1}>{name}</Text>
      <Pressable
        onPress={onEditList}
        accessibilityLabel="Ustawienia listy"
        hitSlop={8}
        style={({pressed}) => [styles.settingsButton, pressed && styles.pressed]}>
        <Settings color={colors.accent} size={22} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}

function Progress({value}: {value: DimensionValue}) {
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, {width: value}]} />
    </View>
  );
}

function ItemSearch({value, onChange}: {value: string; onChange: (value: string) => void}) {
  return (
    <View style={styles.searchBox}>
      <Search color={colors.textMuted} size={22} strokeWidth={2.1} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Szukaj produktu..."
        placeholderTextColor={colors.textMuted}
        style={styles.searchInput}
      />
    </View>
  );
}

function AddButton({onPress}: {onPress: () => void}) {
  return (
    <Pressable
      onPress={onPress}
      style={({pressed}) => [styles.addButton, pressed && styles.pressed]}>
      <Plus color={colors.success} size={22} strokeWidth={2.3} />
      <Text style={styles.addButtonText}>Dodaj</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  detailsHero: {
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 14,
  },
  detailsTopRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
  },
  backText: {
    color: colors.accent,
    fontSize: 17,
    fontWeight: '800',
  },
  titleRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    flex: 1,
    minWidth: 0,
    color: colors.textPrimary,
    fontSize: 38,
    fontWeight: '900',
  },
  settingsButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  manualTypeBadge: {
    borderRadius: 8,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  manualTypeBadgeText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '900',
  },
  autoBadgeRow: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  autoTypeBadge: {
    borderRadius: 8,
    backgroundColor: colors.warningSoft,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  autoTypeBadgeText: {
    color: colors.warning,
    fontSize: 12,
    fontWeight: '900',
  },
  autoLockBadge: {
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  autoLockBadgeText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '900',
  },
  detailsMeta: {
    color: colors.textSecondary,
    fontSize: 15,
    marginTop: 8,
  },
  progressTrack: {
    height: 9,
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 16,
    marginBottom: 16,
  },
  progressFill: {
    height: '100%',
    borderRadius: 8,
    backgroundColor: colors.success,
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
    paddingHorizontal: 14,
    shadowColor: colors.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 4},
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 16,
    paddingVertical: 0,
  },
  autoStatusRow: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  autoStatusText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '700',
  },
  itemsContent: {
    paddingHorizontal: 16,
    paddingBottom: 112,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    gap: 10,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: {width: 0, height: -5},
    elevation: 10,
  },
  addButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.success,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
    shadowColor: colors.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 3},
    elevation: 1,
  },
  addButtonText: {
    color: colors.success,
    fontSize: 16,
    fontWeight: '900',
  },
  actionButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 8,
    backgroundColor: colors.success,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
    shadowColor: colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 5},
    elevation: 4,
  },
  actionButtonText: {
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
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
});
