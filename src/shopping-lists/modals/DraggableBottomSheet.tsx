import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Animated,
  Keyboard,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  type StyleProp,
  StyleSheet,
  type ViewStyle,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {colors} from '../../theme/colors';

export function DraggableBottomSheet({
  visible,
  accessibilityLabel,
  onClose,
  sheetStyle,
  handleStyle,
  handleContent,
  overlay,
  accessibilityContentHidden = false,
  children,
}: {
  visible: boolean;
  accessibilityLabel: string;
  onClose: () => void;
  sheetStyle?: StyleProp<ViewStyle>;
  handleStyle?: StyleProp<ViewStyle>;
  handleContent?: React.ReactNode;
  overlay?: React.ReactNode;
  accessibilityContentHidden?: boolean;
  children: React.ReactNode;
}) {
  const translateY = useRef(new Animated.Value(0)).current;
  // Android is edge-to-edge under Expo, so the sheet reaches behind the navigation bar.
  // Callers can still override paddingBottom through sheetStyle.
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, 16);
  const androidKeyboardHeight = useAndroidKeyboardHeight(visible);

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
      <View style={[styles.backdrop, androidKeyboardHeight > 0 && {paddingBottom: androidKeyboardHeight}]}>
        <Pressable
          accessibilityElementsHidden={accessibilityContentHidden}
          importantForAccessibility={accessibilityContentHidden ? 'no-hide-descendants' : 'auto'}
          accessibilityLabel={accessibilityLabel}
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <Animated.View
          accessibilityElementsHidden={accessibilityContentHidden}
          importantForAccessibility={accessibilityContentHidden ? 'no-hide-descendants' : 'auto'}
          style={[
            styles.sheet,
            {paddingBottom: bottomPadding},
            sheetStyle,
            // The keyboard already covers the navigation bar, so drop the inset padding.
            androidKeyboardHeight > 0 && styles.sheetAboveKeyboard,
            {transform: [{translateY}]},
          ]}>
          <View style={[styles.handleTouch, handleStyle]} {...dragResponder.panHandlers}>
            <View style={styles.handle} />
            {handleContent}
          </View>
          {children}
        </Animated.View>
        {overlay}
      </View>
    </Modal>
  );
}

/**
 * Keyboard height while the sheet is open on Android, 0 otherwise.
 *
 * Under edge-to-edge (always on with Expo) the Modal window no longer shrinks for the
 * keyboard (adjustResize has no effect), so the sheet lifts itself above it instead.
 */
function useAndroidKeyboardHeight(visible: boolean) {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android' || !visible) {
      setHeight(0);
      return;
    }
    const show = Keyboard.addListener('keyboardDidShow', event => setHeight(event.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [visible]);
  return height;
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
  sheetAboveKeyboard: {
    paddingBottom: 16,
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
