import React, {useCallback, useMemo, useRef, useState} from 'react';
import {Animated, PanResponder, StyleSheet, Text, useWindowDimensions, View} from 'react-native';

const DELETE_BG = '#d64545';
const DELETE_BG_ACTIVE = '#b93535';
const SWIPE_DELETE_THRESHOLD = 110;

export function SwipeToDeleteCard({
  children,
  onDelete,
}: {
  children: React.ReactNode;
  onDelete: () => void;
}) {
  const {width} = useWindowDimensions();
  const translateX = useRef(new Animated.Value(0)).current;
  const [active, setActive] = useState(false);

  const animateBack = useCallback(() => {
    setActive(false);
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      speed: 18,
      bounciness: 6,
    }).start();
  }, [translateX]);

  const animateOffAndDelete = useCallback(
    (dir: 1 | -1) => {
      setActive(false);
      Animated.timing(translateX, {
        toValue: dir * width,
        duration: 180,
        useNativeDriver: true,
      }).start(({finished}) => {
        if (finished) {
          onDelete();
        } else {
          animateBack();
        }
      });
    },
    [animateBack, onDelete, translateX, width],
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
          translateX.setValue(dx);
          setActive(Math.abs(dx) >= SWIPE_DELETE_THRESHOLD);
        },
        onPanResponderTerminationRequest: () => true,
        onPanResponderRelease: (_evt, gesture) => {
          const dx = gesture.dx;
          if (Math.abs(dx) >= SWIPE_DELETE_THRESHOLD) {
            animateOffAndDelete(dx > 0 ? 1 : -1);
            return;
          }
          animateBack();
        },
        onPanResponderTerminate: () => {
          animateBack();
        },
      }),
    [animateBack, animateOffAndDelete, translateX],
  );

  const bgOpacity = translateX.interpolate({
    inputRange: [-SWIPE_DELETE_THRESHOLD, 0, SWIPE_DELETE_THRESHOLD],
    outputRange: [1, 0, 1],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.swipeWrap}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.deleteBg,
          {backgroundColor: active ? DELETE_BG_ACTIVE : DELETE_BG, opacity: bgOpacity},
        ]}>
        <Text style={styles.deleteBgText}>Usuń</Text>
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
    borderRadius: 14,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  deleteBgText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 16,
    letterSpacing: 0.2,
  },
});
