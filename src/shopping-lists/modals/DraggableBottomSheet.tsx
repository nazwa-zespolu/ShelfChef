import React, {useCallback, useMemo, useRef} from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  type StyleProp,
  StyleSheet,
  type ViewStyle,
  View,
} from 'react-native';
import {colors} from '../../theme/colors';

export function DraggableBottomSheet({
  visible,
  accessibilityLabel,
  onClose,
  sheetStyle,
  handleStyle,
  overlay,
  children,
}: {
  visible: boolean;
  accessibilityLabel: string;
  onClose: () => void;
  sheetStyle?: StyleProp<ViewStyle>;
  handleStyle?: StyleProp<ViewStyle>;
  overlay?: React.ReactNode;
  children: React.ReactNode;
}) {
  const translateY = useRef(new Animated.Value(0)).current;

  const closeWithDrag = useCallback(() => {
    Animated.timing(translateY, {
      toValue: 420,
      duration: 160,
      useNativeDriver: true,
    }).start(({finished}) => {
      translateY.setValue(0);
      if (finished) {
        onClose();
      }
    });
  }, [onClose, translateY]);

  const resetPosition = useCallback(() => {
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      speed: 18,
      bounciness: 5,
    }).start();
  }, [translateY]);

  const dragResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_evt, gesture) =>
          Math.abs(gesture.dy) > 2 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderGrant: () => {
          translateY.stopAnimation();
        },
        onPanResponderMove: (_evt, gesture) => {
          translateY.setValue(Math.max(0, gesture.dy));
        },
        onPanResponderRelease: (_evt, gesture) => {
          if (gesture.dy > 80 || gesture.vy > 0.9) {
            closeWithDrag();
            return;
          }
          resetPosition();
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderTerminate: resetPosition,
      }),
    [closeWithDrag, resetPosition, translateY],
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable
          accessibilityLabel={accessibilityLabel}
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <Animated.View style={[styles.sheet, sheetStyle, {transform: [{translateY}]}]}>
          <View style={[styles.handleTouch, handleStyle]} {...dragResponder.panHandlers}>
            <View style={styles.handle} />
          </View>
          {children}
        </Animated.View>
        {overlay}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.modalBackdrop,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    padding: 16,
    borderTopWidth: 1,
    borderColor: colors.border,
    maxHeight: '88%',
  },
  handleTouch: {
    alignSelf: 'center',
    width: 120,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  handle: {
    width: 58,
    height: 6,
    borderRadius: 8,
    backgroundColor: colors.border,
  },
});
