import React, {useCallback, useMemo, useRef, useState} from 'react';
import {Animated, PanResponder, StyleSheet, Text, useWindowDimensions, View} from 'react-native';

const DELETE_BG = '#d64545';
const DELETE_BG_ACTIVE = '#b93535';
const DONE_BG = '#47d16b';
const DONE_BG_ACTIVE = '#35b65a';
const SWIPE_DELETE_THRESHOLD = 110;

export function SwipeToDeleteCard({
  children,
  onDelete,
  onSwipeRight,
  resetAfterDelete = false,
  borderRadius = 14,
  allowRightDelete = true,
  rightLabel = 'Kupione',
}: {
  children: React.ReactNode;
  onDelete: () => void;
  onSwipeRight?: () => void;
  resetAfterDelete?: boolean;
  borderRadius?: number;
  allowRightDelete?: boolean;
  rightLabel?: string;
}) {
  const {width} = useWindowDimensions();
  const translateX = useRef(new Animated.Value(0)).current;
  const [active, setActive] = useState(false);
  const [direction, setDirection] = useState<1 | -1>(-1);
  const hasRightAction = onSwipeRight != null || allowRightDelete;

  const animateBack = useCallback(() => {
    setActive(false);
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      speed: 18,
      bounciness: 6,
    }).start();
  }, [translateX]);

  const animateOffAndRun = useCallback(
    (dir: 1 | -1, action: () => void, shouldResetAfterAction: boolean) => {
      setActive(false);
      Animated.timing(translateX, {
        toValue: dir * width,
        duration: 180,
        useNativeDriver: true,
      }).start(({finished}) => {
        if (finished) {
          action();
          if (shouldResetAfterAction) {
            animateBack();
          }
        } else {
          animateBack();
        }
      });
    },
    [animateBack, translateX, width],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_evt, gesture) => {
          const dx = Math.abs(gesture.dx);
          const dy = Math.abs(gesture.dy);
          return dx > 8 && dx > dy;
        },
        onPanResponderGrant: () => {
          translateX.stopAnimation();
        },
        onPanResponderMove: (_evt, gesture) => {
          const dx = gesture.dx;
          const nextDx = dx > 0 && !hasRightAction ? Math.min(dx, 36) : dx;
          translateX.setValue(nextDx);
          setDirection(dx > 0 ? 1 : -1);
          setActive(Math.abs(nextDx) >= SWIPE_DELETE_THRESHOLD);
        },
        onPanResponderTerminationRequest: () => true,
        onPanResponderRelease: (_evt, gesture) => {
          const dx = gesture.dx;
          if (dx <= -SWIPE_DELETE_THRESHOLD) {
            animateOffAndRun(-1, onDelete, resetAfterDelete);
            return;
          }
          if (dx >= SWIPE_DELETE_THRESHOLD && onSwipeRight) {
            animateOffAndRun(1, onSwipeRight, true);
            return;
          }
          if (dx >= SWIPE_DELETE_THRESHOLD && allowRightDelete) {
            animateOffAndRun(1, onDelete, resetAfterDelete);
            return;
          }
          animateBack();
        },
        onPanResponderTerminate: () => {
          animateBack();
        },
      }),
    [allowRightDelete, animateBack, animateOffAndRun, hasRightAction, onDelete, onSwipeRight, resetAfterDelete, translateX],
  );

  const bgOpacity = translateX.interpolate({
    inputRange: [-SWIPE_DELETE_THRESHOLD, 0, SWIPE_DELETE_THRESHOLD],
    outputRange: [1, 0, hasRightAction ? 1 : 0],
    extrapolate: 'clamp',
  });
  const showsRightAction = direction === 1 && onSwipeRight != null;
  const bgColor = showsRightAction
    ? active ? DONE_BG_ACTIVE : DONE_BG
    : active ? DELETE_BG_ACTIVE : DELETE_BG;
  const bgText = showsRightAction ? rightLabel : 'Usuń';

  return (
    <View style={styles.swipeWrap}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.deleteBg,
          direction === 1 ? styles.deleteBgRight : styles.deleteBgLeft,
          {
            backgroundColor: bgColor,
            borderRadius,
            opacity: bgOpacity,
          },
        ]}>
        <Text style={[styles.deleteBgText, showsRightAction && styles.doneBgText]}>
          {bgText}
        </Text>
      </Animated.View>

      <Animated.View style={{transform: [{translateX}]}} {...panResponder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  swipeWrap: {
    position: 'relative',
    marginBottom: 10,
  },
  deleteBg: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  deleteBgLeft: {
    alignItems: 'flex-end',
  },
  deleteBgRight: {
    alignItems: 'flex-start',
  },
  deleteBgText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 16,
    letterSpacing: 0.2,
  },
  doneBgText: {
    color: '#102014',
  },
});
