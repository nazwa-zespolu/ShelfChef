import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  type GestureResponderEvent,
  Keyboard,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { PhotoZoom } from './photoZoom';

function ProductPhotoPreview({
  uri,
  name,
  onClose,
}: {
  uri: string;
  name: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [scale] = useState(() => new Animated.Value(1));
  const [offset] = useState(() => new Animated.ValueXY({ x: 0, y: 0 }));
  const [zoom] = useState(
    () =>
      new PhotoZoom(next => {
        scale.setValue(next.scale);
        offset.setValue({ x: next.x, y: next.y });
      }),
  );
  const responder = useMemo(() => {
    let origin = { x: 0, y: 0 };
    const touches = (event: GestureResponderEvent) =>
      event.nativeEvent.touches.map(touch => ({
        id: touch.identifier,
        x: touch.pageX - origin.x,
        y: touch.pageY - origin.y,
      }));
    return PanResponder.create({
      onStartShouldSetPanResponder: () => zoom.ready,
      onMoveShouldSetPanResponder: () => zoom.ready,
      onPanResponderGrant: event => {
        // The image ignores touches: location coordinates belong to the untransformed viewport.
        const first = event.nativeEvent.touches[0];
        if (first) {
          origin = {
            x: first.pageX - first.locationX,
            y: first.pageY - first.locationY,
          };
        }
        zoom.begin(touches(event), Date.now());
      },
      onPanResponderStart: event => zoom.rebase(touches(event)),
      onPanResponderMove: event => zoom.move(touches(event)),
      onPanResponderEnd: event => zoom.rebase(touches(event)),
      onPanResponderRelease: () => zoom.release(Date.now()),
      onPanResponderTerminate: () => zoom.cancel(),
      onPanResponderTerminationRequest: () => false,
    });
  }, [zoom]);

  return (
    <View
      testID="product-photo-preview"
      accessibilityViewIsModal
      onAccessibilityEscape={onClose}
      style={[
        styles.preview,
        {
          paddingTop: Math.max(insets.top, 12),
          paddingBottom: Math.max(insets.bottom, 12),
          paddingLeft: Math.max(insets.left, 16),
          paddingRight: Math.max(insets.right, 16),
        },
      ]}
    >
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={2}>
          {name.trim() || 'Zdjęcie produktu'}
        </Text>
        <Pressable
          testID="product-photo-preview-close"
          accessibilityRole="button"
          accessibilityLabel="Zamknij podgląd zdjęcia"
          onPress={onClose}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
        >
          <Text style={styles.closeText}>×</Text>
        </Pressable>
      </View>
      <View
        testID="product-photo-preview-viewport"
        style={styles.imageArea}
        onLayout={event => zoom.setViewport(event.nativeEvent.layout)}
        {...responder.panHandlers}
      >
        {failed ? (
          <Text accessibilityRole="alert" style={styles.message}>
            Nie udało się wczytać zdjęcia.
          </Text>
        ) : (
          <>
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <Animated.Image
                testID="product-photo-preview-image"
                source={{ uri }}
                accessibilityLabel={`Zdjęcie produktu: ${name}`}
                resizeMode="contain"
                style={[
                  styles.image,
                  {
                    transform: [
                      { translateX: offset.x },
                      { translateY: offset.y },
                      { scale },
                    ],
                  },
                ]}
                onLoad={event => zoom.setImage(event.nativeEvent.source)}
                onLoadEnd={() => setLoading(false)}
                onError={() => {
                  setFailed(true);
                  setLoading(false);
                  zoom.setImage({ width: 0, height: 0 });
                }}
              />
            </View>
            {loading ? (
              <ActivityIndicator
                accessibilityLabel="Wczytuję zdjęcie"
                color={colors.accent}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

// Render the preview in the sheet's overlay, keeping the form and its photo draft mounted.
export function useProductPhotoPreview({
  uri,
  name,
  ownerKey,
}: {
  uri: string | null | undefined;
  name: string;
  ownerKey: string | null;
}) {
  const [selection, setSelection] = useState<{
    uri: string;
    ownerKey: string;
  } | null>(null);
  useEffect(() => {
    setSelection(null);
  }, [uri, ownerKey]);
  const visible =
    selection != null &&
    selection.uri === uri &&
    selection.ownerKey === ownerKey;
  const close = () => {
    setSelection(null);
    return visible;
  };

  return {
    visible,
    open: () => {
      if (uri?.trim() && ownerKey != null) {
        Keyboard.dismiss();
        setSelection({ uri, ownerKey });
      }
    },
    close,
    overlay: visible ? (
      <ProductPhotoPreview uri={selection.uri} name={name} onClose={close} />
    ) : null,
  };
}

const styles = StyleSheet.create({
  preview: { ...StyleSheet.absoluteFill, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 12,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  close: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { fontSize: 32, color: colors.textPrimary },
  imageArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  message: { fontSize: 15, color: colors.textSecondary, textAlign: 'center' },
  pressed: { opacity: 0.7 },
});
