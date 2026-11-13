import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {Camera, ImagePlus, Trash2} from 'lucide-react-native';
import {colors} from '../theme/colors';
import {shadows} from '../theme/shadows';

export function ProductPhotoActions({
  hasPhoto,
  disabled,
  picking,
  onTakePhoto,
  onPickFromLibrary,
  onClear,
  testIDPrefix,
}: {
  hasPhoto: boolean;
  disabled: boolean;
  picking: boolean;
  onTakePhoto: () => void;
  onPickFromLibrary: () => void;
  onClear: () => void;
  testIDPrefix?: string;
}) {
  const unavailable = disabled || picking;
  return (
    <View style={styles.actions}>
      <View style={styles.row}>
        <Pressable
          testID={testIDPrefix ? `${testIDPrefix}-camera` : undefined}
          accessibilityRole="button"
          disabled={unavailable}
          onPress={() => { if (!unavailable) { onTakePhoto(); } }}
          style={({pressed}) => [styles.button, unavailable && styles.disabled, pressed && styles.pressed]}>
          <Camera color={colors.textPrimary} size={18} strokeWidth={2.2} />
          <Text style={styles.buttonText}>Aparat</Text>
        </Pressable>
        <Pressable
          testID={testIDPrefix ? `${testIDPrefix}-library` : undefined}
          accessibilityRole="button"
          disabled={unavailable}
          onPress={() => { if (!unavailable) { onPickFromLibrary(); } }}
          style={({pressed}) => [styles.button, unavailable && styles.disabled, pressed && styles.pressed]}>
          <ImagePlus color={colors.textPrimary} size={18} strokeWidth={2.2} />
          <Text style={styles.buttonText}>Galeria</Text>
        </Pressable>
      </View>
      {hasPhoto ? (
        <Pressable
          testID={testIDPrefix ? `${testIDPrefix}-clear` : undefined}
          accessibilityRole="button"
          disabled={unavailable}
          onPress={() => { if (!unavailable) { onClear(); } }}
          style={({pressed}) => [styles.clearButton, unavailable && styles.disabled, pressed && styles.pressed]}>
          <Trash2 color={colors.warning} size={16} strokeWidth={2.2} />
          <Text style={styles.clearText}>Usuń zdjęcie</Text>
        </Pressable>
      ) : null}
      {picking ? <Text style={styles.status}>Przygotowuję zdjęcie…</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {gap: 8},
  row: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  button: {
    ...shadows.control,
    flexGrow: 1, flexBasis: 88, minHeight: 44, borderRadius: 8,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSubtle,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8,
  },
  buttonText: {color: colors.textPrimary, fontSize: 14, fontWeight: '800'},
  clearButton: {
    alignSelf: 'stretch', minHeight: 44, borderRadius: 8,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10,
  },
  clearText: {color: colors.warning, fontSize: 14, fontWeight: '800'},
  status: {color: colors.textSecondary, fontSize: 13},
  pressed: {opacity: 0.78},
  disabled: {opacity: 0.45},
});
