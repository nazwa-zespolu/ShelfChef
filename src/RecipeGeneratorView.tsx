import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {colors} from './theme/colors';

type RecipeGeneratorViewProps = {
  onRequestClose: () => void;
};

export default function RecipeGeneratorView({onRequestClose}: RecipeGeneratorViewProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, {paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12}]}>
      <View style={styles.header}>
        <Pressable onPress={onRequestClose} style={({pressed}) => [styles.back, pressed && styles.backPressed]} hitSlop={10}>
          <Text style={styles.backText}>&#8592; Wróć</Text>
        </Pressable>
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>Generator przepisów</Text>
        <Text style={styles.hint}>
          Ten widok będzie wykorzystywał produkty z zapasów do proponowania przepisów. Funkcja zostanie podłączona
          w kolejnej iteracji.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.black,
  },
  header: {
    paddingHorizontal: 8,
  },
  back: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backPressed: {
    opacity: 0.7,
  },
  backText: {
    color: colors.successAccent,
    fontSize: 16,
    fontWeight: '700',
  },
  body: {
    flex: 1,
    padding: 20,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 12,
  },
  hint: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
});
