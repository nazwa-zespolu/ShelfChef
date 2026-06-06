import React, {useCallback, useMemo, useRef, useState} from 'react';
import {Animated, Easing, PanResponder, Pressable, StyleSheet, Text, View} from 'react-native';
import {Link, Pencil} from 'lucide-react-native';
import {SwipeToDeleteCard} from '../../components/SwipeToDeleteCard';
import type {AutoShoppingListItemState, ShoppingItemStatus} from '../../domain/types';
import {colors} from '../../theme/colors';
import {ShoppingItemIconBubble} from './ShoppingItemIconBubble';

type SharedShoppingItemRowProps = {
  item: AutoShoppingListItemState;
  busy: boolean;
  onDelete: (id: string) => Promise<void>;
  onUpdateQuantity: (id: string, quantity: number) => Promise<void>;
  onOpenLinks: (item: AutoShoppingListItemState) => void;
  onEdit: (item: AutoShoppingListItemState) => void;
};

export function ManualShoppingItemRow({
  item,
  busy,
  reorderEnabled,
  onDelete,
  onMove,
  onUpdateQuantity,
  onUpdateStatus,
  onOpenLinks,
  onEdit,
  playSwipeHint,
  onSwipeHintComplete,
}: SharedShoppingItemRowProps & {
  reorderEnabled: boolean;
  onMove: (id: string, direction: -1 | 1) => void;
  onUpdateStatus: (id: string, status: ShoppingItemStatus) => Promise<void>;
  playSwipeHint: boolean;
  onSwipeHintComplete: () => void;
}) {
  const hintTranslateX = useRef(new Animated.Value(0)).current;
  const hasPlayedThisHint = useRef(false);
  const {translateY, dragging, panHandlers} = useShoppingItemDrag({
    enabled: reorderEnabled,
    itemId: item.id,
    onMove,
  });
  const isPurchased = item.effectiveStatus === 'purchased';
  const nextToggleStatus: ShoppingItemStatus = isPurchased ? 'planned' : 'purchased';
  const canDecrease = item.quantity > 1 && !busy;

  React.useEffect(() => {
    if (!playSwipeHint || hasPlayedThisHint.current) {
      return;
    }
    hasPlayedThisHint.current = true;
    hintTranslateX.setValue(0);
    Animated.sequence([
      Animated.delay(520),
      Animated.timing(hintTranslateX, {
        toValue: 86,
        duration: 460,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.delay(170),
      Animated.timing(hintTranslateX, {
        toValue: 0,
        useNativeDriver: true,
        duration: 280,
        easing: Easing.inOut(Easing.cubic),
      }),
      Animated.timing(hintTranslateX, {
        toValue: -86,
        duration: 460,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.delay(170),
      Animated.timing(hintTranslateX, {
        toValue: 0,
        useNativeDriver: true,
        duration: 300,
        easing: Easing.out(Easing.cubic),
      }),
    ]).start(() => {
      onSwipeHintComplete();
    });
  }, [hintTranslateX, onSwipeHintComplete, playSwipeHint]);

  return (
    <SwipeToDeleteCard
      resetAfterDelete
      borderRadius={8}
      allowRightDelete={false}
      onDelete={() => { onDelete(item.id).catch(() => {}); }}
      onSwipeRight={() => { onUpdateStatus(item.id, nextToggleStatus).catch(() => {}); }}
      rightLabel={isPurchased ? 'Cofnij' : 'Kupione'}
      rightActionTone={isPurchased ? 'warning' : 'success'}>
      {playSwipeHint ? (
        <View pointerEvents="none" style={styles.swipeHintBackground}>
          <View style={[styles.swipeHintAction, styles.swipeHintActionDone]}>
            <Text style={styles.swipeHintActionText}>Kupione</Text>
          </View>
          <View style={[styles.swipeHintAction, styles.swipeHintActionDelete]}>
            <Text style={styles.swipeHintActionText}>Usuń</Text>
          </View>
        </View>
      ) : null}
      <Animated.View style={{transform: [{translateY}, {translateX: hintTranslateX}]}}>
        <View
          style={[
            styles.itemCard,
            isPurchased && styles.itemCardPurchased,
            dragging && styles.itemCardDragging,
          ]}>
          {isPurchased ? <View style={styles.itemStatusBar} /> : null}
          <View {...panHandlers}>
            <ShoppingItemIconBubble
              iconKey={item.iconKey}
              iconColorKey={item.iconColorKey}
              imageUrl={item.imageUrl}
              purchased={isPurchased}
            />
          </View>
          <ShoppingItemText item={item} purchased={isPurchased} onOpenLinks={onOpenLinks} onEdit={onEdit} />
          <View style={styles.itemControls}>
            <QuantityStepper item={item} busy={busy} canDecrease={canDecrease} onUpdateQuantity={onUpdateQuantity} />
          </View>
        </View>
      </Animated.View>
    </SwipeToDeleteCard>
  );
}

export function AutoShoppingItemRow({
  item,
  busy,
  reorderEnabled,
  onDelete,
  onMove,
  onUpdateQuantity,
  onOpenLinks,
  onEdit,
}: SharedShoppingItemRowProps & {
  reorderEnabled: boolean;
  onMove: (id: string, direction: -1 | 1) => void;
}) {
  const {translateY, dragging, panHandlers} = useShoppingItemDrag({
    enabled: reorderEnabled,
    itemId: item.id,
    onMove,
  });
  const canDecrease = item.quantity > 1 && !busy;

  return (
    <SwipeToDeleteCard
      resetAfterDelete
      borderRadius={8}
      allowRightDelete={false}
      onDelete={() => { onDelete(item.id).catch(() => {}); }}>
      <Animated.View style={{transform: [{translateY}]}}>
        <View style={[styles.itemCard, dragging && styles.itemCardDragging]}>
          <View {...panHandlers}>
            <ShoppingItemIconBubble
              iconKey={item.iconKey}
              iconColorKey={item.iconColorKey}
              imageUrl={item.imageUrl}
            />
          </View>
          <ShoppingItemText item={item} onOpenLinks={onOpenLinks} onEdit={onEdit} showTargetQuantity />
          <QuantityStepper item={item} busy={busy} canDecrease={canDecrease} onUpdateQuantity={onUpdateQuantity} />
        </View>
      </Animated.View>
    </SwipeToDeleteCard>
  );
}

function useShoppingItemDrag({
  enabled,
  itemId,
  onMove,
}: {
  enabled: boolean;
  itemId: string;
  onMove: (id: string, direction: -1 | 1) => void;
}) {
  const translateY = useRef(new Animated.Value(0)).current;
  const dragActive = useRef(false);
  const dragTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const movedAt = useRef(0);
  const [dragging, setDragging] = useState(false);

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
        onStartShouldSetPanResponder: () => enabled,
        onMoveShouldSetPanResponder: (_evt, gesture) =>
          enabled && Math.abs(gesture.dy) > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
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
            onMove(itemId, 1);
          } else if (gesture.dy < -46) {
            movedAt.current = now;
            translateY.setValue(0);
            onMove(itemId, -1);
          }
        },
        onPanResponderRelease: resetPosition,
        onPanResponderTerminate: resetPosition,
      }),
    [enabled, itemId, onMove, resetPosition, translateY],
  );

  return {
    translateY,
    dragging,
    panHandlers: dragResponder.panHandlers,
  };
}

function ShoppingItemText({
  item,
  purchased = false,
  showTargetQuantity = false,
  onOpenLinks,
  onEdit,
}: {
  item: AutoShoppingListItemState;
  purchased?: boolean;
  showTargetQuantity?: boolean;
  onOpenLinks: (item: AutoShoppingListItemState) => void;
  onEdit: (item: AutoShoppingListItemState) => void;
}) {
  return (
    <View style={styles.itemText}>
      <View style={styles.itemTitleRow}>
        <Text
          style={[styles.itemTitle, purchased && styles.itemTitlePurchased]}
          numberOfLines={1}>
          {item.label}
        </Text>
        {!item.catalogProductId ? (
          <Pressable
            accessibilityLabel={`Edytuj produkt ${item.label}`}
            hitSlop={6}
            onPress={() => onEdit(item)}
            style={({pressed}) => [styles.itemEditButton, pressed && styles.pressed]}>
            <Pencil color={colors.textSecondary} size={15} strokeWidth={2.2} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.itemMetaRow}>
        <Text style={styles.itemMeta} numberOfLines={1}>
          Masz {item.currentQuantity}{showTargetQuantity ? ` z ${item.quantity}` : ''}
        </Text>
        {!item.catalogProductId ? (
          <Pressable
            onPress={() => onOpenLinks(item)}
            style={({pressed}) => [styles.itemCatalogLink, pressed && styles.pressed]}>
            <Link color={colors.accent} size={13} strokeWidth={2.1} />
            <Text style={styles.itemCatalogLinkText} numberOfLines={1}>
              {item.linkedCatalogProducts.length > 0
                ? `Powiązania ${item.linkedCatalogProducts.length}`
                : 'Powiąż katalog'}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function QuantityStepper({
  item,
  busy,
  canDecrease,
  onUpdateQuantity,
}: {
  item: AutoShoppingListItemState;
  busy: boolean;
  canDecrease: boolean;
  onUpdateQuantity: (id: string, quantity: number) => Promise<void>;
}) {
  return (
    <View style={styles.quantityStepper}>
      <Pressable
        disabled={!canDecrease}
        style={({pressed}) => [
          styles.stepButton,
          !canDecrease && styles.disabled,
          pressed && styles.pressed,
        ]}
        onPress={() => onUpdateQuantity(item.id, item.quantity - 1)}>
        <Text style={styles.stepText}>−</Text>
      </Pressable>
      <Text style={styles.quantityText}>{item.quantity}</Text>
      <Pressable
        disabled={busy}
        style={({pressed}) => [
          styles.stepButton,
          busy && styles.disabled,
          pressed && styles.pressed,
        ]}
        onPress={() => onUpdateQuantity(item.id, item.quantity + 1)}>
        <Text style={styles.stepText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  itemCard: {
    minHeight: 78,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 6},
    elevation: 3,
  },
  itemCardPurchased: {
    borderColor: colors.accentSoft,
    backgroundColor: colors.surface,
  },
  itemCardDragging: {
    borderColor: colors.success,
    shadowOpacity: 0.14,
    elevation: 5,
  },
  swipeHintBackground: {
    ...StyleSheet.absoluteFill,
    borderRadius: 8,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  swipeHintAction: {
    flex: 1,
    minHeight: 78,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  swipeHintActionDone: {
    alignItems: 'flex-start',
    backgroundColor: colors.success,
  },
  swipeHintActionDelete: {
    alignItems: 'flex-end',
    backgroundColor: colors.danger,
  },
  swipeHintActionText: {
    color: colors.successText,
    fontSize: 13,
    fontWeight: '900',
  },
  itemStatusBar: {
    position: 'absolute',
    left: 0,
    top: 10,
    bottom: 10,
    width: 4,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    backgroundColor: colors.success,
  },
  itemText: {
    flex: 1,
    minWidth: 0,
  },
  itemTitleRow: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  itemTitle: {
    flex: 1,
    minWidth: 0,
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '900',
  },
  itemTitlePurchased: {
    color: colors.textSecondary,
  },
  itemEditButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  itemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    minWidth: 0,
  },
  itemMeta: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 4,
    flexShrink: 0,
  },
  itemCatalogLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    paddingVertical: 2,
    minWidth: 0,
    flexShrink: 1,
  },
  itemCatalogLinkText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '800',
    flexShrink: 1,
  },
  itemControls: {
    alignItems: 'flex-end',
  },
  quantityStepper: {
    height: 38,
    minWidth: 98,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: colors.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 3},
    elevation: 1,
  },
  stepButton: {
    width: 32,
    height: 36,
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
    minWidth: 34,
    textAlign: 'center',
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.78,
  },
  disabled: {
    opacity: 0.45,
  },
});
