import React, {useCallback, useRef, useState} from 'react';
import {Animated, StyleSheet, Text, View} from 'react-native';
import {Check, X} from 'lucide-react-native';
import {colors} from '../theme/colors';

export type ToastTone = 'success' | 'error';

export type ToastMessage = {
  message: string;
  tone: ToastTone;
};

export function useAppToast() {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const toastAnim = useRef(new Animated.Value(0)).current;
  const toastRunId = useRef(0);

  const showToast = useCallback(
    (message: string, tone: ToastTone = 'success') => {
      const runId = toastRunId.current + 1;
      toastRunId.current = runId;
      toastAnim.stopAnimation();
      toastAnim.setValue(0);
      setToast({message, tone});
      Animated.sequence([
        Animated.timing(toastAnim, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.delay(1450),
        Animated.timing(toastAnim, {
          toValue: 2,
          duration: 240,
          useNativeDriver: true,
        }),
      ]).start(({finished}) => {
        if (finished && toastRunId.current === runId) {
          setToast(null);
        }
      });
    },
    [toastAnim],
  );

  return {toast, toastAnim, showToast};
}

type AppToastProps = {
  toast: ToastMessage | null;
  animatedValue: Animated.Value;
  top: number;
};

export function AppToast({toast, animatedValue, top}: AppToastProps) {
  if (!toast) {
    return null;
  }

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.overlay,
        {
          top,
          opacity: animatedValue.interpolate({
            inputRange: [0, 1, 2],
            outputRange: [0, 1, 0],
          }),
          transform: [
            {
              translateY: animatedValue.interpolate({
                inputRange: [0, 1, 2],
                outputRange: [8, 0, -14],
              }),
            },
          ],
        },
      ]}>
      <View style={[styles.bubble, toast.tone === 'error' && styles.bubbleError]}>
        <View style={[styles.icon, toast.tone === 'error' && styles.iconError]}>
          {toast.tone === 'error' ? (
            <X color={colors.successText} size={15} strokeWidth={3} />
          ) : (
            <Check color={colors.successText} size={15} strokeWidth={3} />
          )}
        </View>
        <Text style={styles.text} numberOfLines={1}>
          {toast.message}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 1000,
    elevation: 1000,
    alignItems: 'center',
  },
  bubble: {
    maxWidth: 520,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.success,
    backgroundColor: colors.surfaceSubtle,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bubbleError: {
    borderColor: colors.danger,
  },
  icon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconError: {
    backgroundColor: colors.danger,
  },
  text: {
    flexShrink: 1,
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '900',
  },
});
