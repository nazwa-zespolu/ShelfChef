import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../../theme/colors';

type Props = {
  dishes: string[];
  onGenerateAgain: () => void;
  onBackToPreferences: () => void;
};

export function RecipeResultsScreen({
  dishes,
  onGenerateAgain,
  onBackToPreferences,
}: Props) {
  return (
    <View style={styles.body}>
      <Text style={styles.title}>Propozycje dan</Text>
      <FlatList
        data={dishes}
        keyExtractor={(item, index) => `${index}-${item}`}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>Brak wynikow do wyswietlenia.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.rowText}>{item}</Text>
          </View>
        )}
      />
      <View style={styles.actions}>
        <Pressable style={styles.primaryButton} onPress={onGenerateAgain}>
          <Text style={styles.primaryButtonText}>Generuj ponownie</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={onBackToPreferences}>
          <Text style={styles.secondaryButtonText}>Zmien ustawienia</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    gap: 12,
  },
  title: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 18,
  },
  list: {
    paddingBottom: 8,
    gap: 8,
  },
  row: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  rowText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  emptyBox: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
    padding: 14,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  actions: {
    gap: 10,
    paddingBottom: 8,
  },
  primaryButton: {
    backgroundColor: colors.success,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: colors.successText,
    fontWeight: '800',
    fontSize: 14,
  },
  secondaryButton: {
    backgroundColor: colors.surfaceSubtle,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 14,
  },
});
