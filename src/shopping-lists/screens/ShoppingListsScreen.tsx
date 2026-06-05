import React, {useCallback, useMemo, useRef, useState} from 'react';
import {
  Animated,
  FlatList,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type {ShoppingListSummary, ShoppingListType} from '../../domain/types';
import {SwipeToDeleteCard} from '../../components/SwipeToDeleteCard';
import {
  getShoppingListIconColorDefinition,
  getShoppingListIconDefinition,
} from '../../shoppingListIcons';
import {colors} from '../../theme/colors';
import {EmptyState} from '../components/EmptyState';

export type ShoppingListFilter = 'all' | 'manual' | 'auto';

export type ShoppingListCardStats = {
  itemCount: number;
  purchasedCount: number;
};

type ShoppingListsScreenProps = {
  lists: ShoppingListSummary[];
  filteredLists: ShoppingListSummary[];
  listSearch: string;
  listFilter: ShoppingListFilter;
  suggestionsCount: number;
  listStats: Record<string, ShoppingListCardStats>;
  onChangeListSearch: (value: string) => void;
  onChangeListFilter: (value: ShoppingListFilter) => void;
  onCreateList: () => void;
  onOpenSuggestions: () => void;
  onOpenList: (list: ShoppingListSummary) => void;
  onMoveList: (id: string, direction: -1 | 1) => void;
  onRequestDeleteList: (list: ShoppingListSummary) => void;
};

const LIST_FILTERS: {key: ShoppingListFilter; label: string}[] = [
  {key: 'all', label: 'Wszystkie'},
  {key: 'manual', label: 'Manualne'},
  {key: 'auto', label: 'Auto'},
];

const EMPTY_LIST_STATS: ShoppingListCardStats = {
  itemCount: 0,
  purchasedCount: 0,
};

function listTypeBadge(type: ShoppingListType) {
  return type === 'auto' ? 'Auto' : 'Manualna';
}

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

function shortageLabel(count: number) {
  if (count === 1) {
    return '1 brak';
  }
  if (count > 1 && count < 5) {
    return `${count} braki`;
  }
  return `${count} braków`;
}

export function ShoppingListsScreen({
  lists,
  filteredLists,
  listSearch,
  listFilter,
  suggestionsCount,
  listStats,
  onChangeListSearch,
  onChangeListFilter,
  onCreateList,
  onOpenSuggestions,
  onOpenList,
  onMoveList,
  onRequestDeleteList,
}: ShoppingListsScreenProps) {
  const renderListRow = ({item}: {item: ShoppingListSummary}) => (
    <SortableListRow
      item={item}
      stats={listStats[item.id] ?? EMPTY_LIST_STATS}
      onOpen={onOpenList}
      onMove={onMoveList}
      onRequestDelete={onRequestDeleteList}
    />
  );

  const renderReplenishmentTile = () => (
    <Pressable
      onPress={onOpenSuggestions}
      style={({pressed}) => [styles.replenishmentTile, pressed && styles.cardPressed]}>
      <View style={styles.replenishmentIcon}>
        {React.createElement(getShoppingListIconDefinition('refresh').Icon, {
          color: colors.accent,
          size: 42,
          strokeWidth: 2,
        })}
      </View>
      <View style={styles.replenishmentText}>
        <View style={styles.titleBadgeRow}>
          <Text style={styles.suggestionTitle}>Do uzupełnienia</Text>
          <View style={styles.suggestionBadge}>
            <Text style={styles.suggestionBadgeText}>Sugestie</Text>
          </View>
        </View>
        <Text style={styles.suggestionMeta}>
          {shortageLabel(suggestionsCount)} z list auto
        </Text>
      </View>
      <Text style={styles.suggestionArrow}>›</Text>
    </Pressable>
  );

  return (
    <View style={styles.content}>
      <View style={styles.listsHero}>
        <Text style={styles.screenTitle}>Listy zakupów</Text>
        <View style={styles.searchCreateRow}>
          <View style={styles.searchBox}>
            <Text style={styles.searchIcon}>⌕</Text>
            <TextInput
              value={listSearch}
              onChangeText={onChangeListSearch}
              placeholder="Szukaj listy..."
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
            />
          </View>
          <Pressable
            onPress={onCreateList}
            style={({pressed}) => [styles.newListButton, pressed && styles.pressed]}>
            <Text style={styles.newListButtonText}>Nowa</Text>
          </Pressable>
        </View>
        <View style={styles.filterBar}>
          {LIST_FILTERS.map(filter => {
            const active = filter.key === listFilter;
            return (
              <Pressable
                key={filter.key}
                onPress={() => onChangeListFilter(filter.key)}
                style={({pressed}) => [
                  styles.filterSegment,
                  active && styles.filterSegmentActive,
                  pressed && styles.pressed,
                ]}>
                <Text style={[styles.filterSegmentText, active && styles.filterSegmentTextActive]}>
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <FlatList
        data={filteredLists}
        keyExtractor={item => item.id}
        renderItem={renderListRow}
        ListHeaderComponent={renderReplenishmentTile}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          lists.length === 0 ? (
            <EmptyState
              title="Zacznij od pierwszej listy"
              description="Manualna sprawdzi się na zakupy, auto pokaże braki w zapasach."
              details={[
                'Przytrzymaj ikonę, aby zmienić kolejność.',
                'Przesuń listę w lewo, aby usunąć.',
              ]}
            />
          ) : (
            <EmptyState title="Brak pasujących list" />
          )
        }
      />
    </View>
  );
}

function SortableListRow({
  item,
  stats,
  onOpen,
  onMove,
  onRequestDelete,
}: {
  item: ShoppingListSummary;
  stats: ShoppingListCardStats;
  onOpen: (item: ShoppingListSummary) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onRequestDelete: (item: ShoppingListSummary) => void;
}) {
  const translateY = useRef(new Animated.Value(0)).current;
  const dragActive = useRef(false);
  const dragTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const movedAt = useRef(0);
  const [dragging, setDragging] = useState(false);
  const Icon = getShoppingListIconDefinition(item.iconKey).Icon;
  const iconColor = getShoppingListIconColorDefinition(item.iconColorKey);

  const resetPosition = useCallback(() => {
    if (dragTimer.current) {
      clearTimeout(dragTimer.current);
      dragTimer.current = null;
    }
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      speed: 20,
      bounciness: 4,
    }).start();
    dragActive.current = false;
    setDragging(false);
  }, [translateY]);

  const dragResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          movedAt.current = 0;
          dragTimer.current = setTimeout(() => {
            dragActive.current = true;
            setDragging(true);
          }, 180);
        },
        onPanResponderMove: (_evt, gesture) => {
          if (!dragActive.current) {
            return;
          }
          translateY.setValue(gesture.dy);
          const now = Date.now();
          if (now - movedAt.current < 220) {
            return;
          }
          if (gesture.dy > 46) {
            movedAt.current = now;
            translateY.setValue(0);
            onMove(item.id, 1);
          } else if (gesture.dy < -46) {
            movedAt.current = now;
            translateY.setValue(0);
            onMove(item.id, -1);
          }
        },
        onPanResponderRelease: resetPosition,
        onPanResponderTerminate: resetPosition,
      }),
    [item.id, onMove, resetPosition, translateY],
  );

  return (
    <SwipeToDeleteCard
      resetAfterDelete
      borderRadius={8}
      allowRightDelete={false}
      onDelete={() => onRequestDelete(item)}>
      <Animated.View style={{transform: [{translateY}]}}>
        <Pressable
          onPress={() => {
            if (!dragActive.current) {
              onOpen(item);
            }
          }}
          style={({pressed}) => [
            styles.card,
            styles.listCard,
            dragging && styles.cardDragging,
            pressed && styles.cardPressed,
          ]}>
          <View style={styles.rowBetween}>
            <View
              style={[styles.listIconBubble, {backgroundColor: iconColor.background}]}
              {...dragResponder.panHandlers}>
              <Icon color={iconColor.color} size={26} strokeWidth={2.2} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.cardMeta}>
                {pluralizeItems(stats.itemCount)} · {purchasedLabel(stats.purchasedCount)}
              </Text>
            </View>
            <View style={styles.listTrailing}>
              {item.type === 'auto' && item.isLocked ? (
                <View style={[styles.badge, styles.badgeMuted]}>
                  <Text style={[styles.badgeText, styles.badgeMutedText]}>Lock</Text>
                </View>
              ) : null}
              <View style={styles.listTrailingRow}>
                <View style={[styles.listTypePill, item.type === 'manual' ? styles.listTypePillManual : styles.listTypePillAuto]}>
                  <Text style={[styles.listTypePillText, item.type === 'manual' ? styles.listTypePillTextManual : styles.listTypePillTextAuto]}>
                    {listTypeBadge(item.type)}
                  </Text>
                </View>
                <Text style={styles.suggestionArrow}>›</Text>
              </View>
            </View>
          </View>
        </Pressable>
      </Animated.View>
    </SwipeToDeleteCard>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  listsHero: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
  },
  screenTitle: {
    color: colors.textPrimary,
    fontSize: 30,
    fontWeight: '900',
    marginBottom: 16,
  },
  searchCreateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  searchBox: {
    flex: 1,
    minHeight: 52,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    shadowColor: colors.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 3},
    elevation: 2,
  },
  searchIcon: {
    color: colors.textMuted,
    fontSize: 25,
    lineHeight: 28,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 16,
    paddingVertical: 0,
  },
  newListButton: {
    minHeight: 52,
    minWidth: 92,
    borderRadius: 8,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    shadowColor: colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 5},
    elevation: 3,
  },
  newListButtonText: {
    color: colors.successText,
    fontSize: 16,
    fontWeight: '900',
  },
  filterBar: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
    flexDirection: 'row',
    padding: 5,
    gap: 4,
    shadowColor: colors.shadow,
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 3},
    elevation: 1,
  },
  filterSegment: {
    flex: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterSegmentActive: {
    backgroundColor: colors.success,
  },
  filterSegmentText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  filterSegmentTextActive: {
    color: colors.successText,
  },
  replenishmentTile: {
    marginBottom: 12,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    minHeight: 126,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    shadowColor: colors.shadow,
    shadowOpacity: 0.09,
    shadowRadius: 14,
    shadowOffset: {width: 0, height: 7},
    elevation: 4,
  },
  replenishmentIcon: {
    width: 86,
    height: 86,
    borderRadius: 8,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  replenishmentText: {
    flex: 1,
    minWidth: 0,
  },
  titleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  suggestionTitle: {
    color: colors.textPrimary,
    fontSize: 23,
    fontWeight: '900',
  },
  suggestionMeta: {
    color: colors.textSecondary,
    marginTop: 8,
    fontSize: 15,
  },
  suggestionBadge: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  suggestionBadgeText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '900',
  },
  suggestionArrow: {
    color: colors.accent,
    fontSize: 30,
    fontWeight: '400',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 94,
  },
  card: {
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 6},
    elevation: 3,
  },
  listCard: {
    minHeight: 74,
    marginBottom: 0,
  },
  cardPressed: {
    opacity: 0.86,
  },
  cardDragging: {
    borderColor: colors.success,
    shadowOpacity: 0.14,
    elevation: 5,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  listIconBubble: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '900',
  },
  cardMeta: {
    color: colors.textSecondary,
    marginTop: 3,
    fontSize: 13,
  },
  listTypePill: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  listTypePillManual: {
    borderColor: colors.accentSoft,
    backgroundColor: colors.accentSoft,
  },
  listTypePillAuto: {
    borderColor: colors.warningSoft,
    backgroundColor: colors.warningSoft,
  },
  listTypePillText: {
    fontSize: 11,
    fontWeight: '900',
  },
  listTypePillTextManual: {
    color: colors.accent,
  },
  listTypePillTextAuto: {
    color: colors.warning,
  },
  listTrailing: {
    minHeight: 50,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  listTrailingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    borderRadius: 8,
    backgroundColor: colors.success,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  badgeMuted: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeText: {
    color: colors.successText,
    fontWeight: '900',
    fontSize: 11,
  },
  badgeMutedText: {
    color: colors.textSecondary,
  },
  pressed: {
    opacity: 0.82,
  },
});
