import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../../theme/colors';
import { DietPreference, DishType } from '../domain/recipeGenerationTypes';

type Props = {
  dishType: DishType;
  diet: DietPreference;
  isModelReady: boolean;
  downloadProgress: number;
  modelError: string | null;
  onDishTypeChange: (value: DishType) => void;
  onDietChange: (value: DietPreference) => void;
  onStart: () => void;
  onRetryModel: () => void;
  debugEnabled: boolean;
  debugSnapshot: string;
  debugEvents: string[];
  onToggleDebug: () => void;
  onRefreshDebugSnapshot: () => void;
  onResetNormalizedNames: () => void;
};

const DISH_TYPES: { value: DishType; label: string }[] = [
  { value: 'breakfast', label: 'Sniadanie' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Obiad' },
  { value: 'snack', label: 'Przekaska' },
  { value: 'dessert', label: 'Deser' },
  { value: 'any', label: 'Dowolne' },
];

const DIETS: { value: DietPreference; label: string }[] = [
  { value: 'none', label: 'Bez ograniczen' },
  { value: 'vegetarian', label: 'Wegetarianska' },
  { value: 'vegan', label: 'Weganska' },
  { value: 'gluten-free', label: 'Bez glutenu' },
  { value: 'dairy-free', label: 'Bez nabialu' },
  { value: 'low-carb', label: 'Low-carb' },
];

export function RecipePreferencesScreen({
  dishType,
  diet,
  isModelReady,
  downloadProgress,
  modelError,
  onDishTypeChange,
  onDietChange,
  onStart,
  onRetryModel,
  debugEnabled,
  debugSnapshot,
  debugEvents,
  onToggleDebug,
  onRefreshDebugSnapshot,
  onResetNormalizedNames,
}: Props) {
  return (
    <View style={styles.body}>
      <Text style={styles.sectionTitle}>Typ dania</Text>
      <View style={styles.chipRow}>
        {DISH_TYPES.map(option => (
          <Pressable
            key={option.value}
            onPress={() => onDishTypeChange(option.value)}
            style={[
              styles.chip,
              dishType === option.value && styles.chipActive,
            ]}>
            <Text
              style={[
                styles.chipText,
                dishType === option.value && styles.chipTextActive,
              ]}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Dieta</Text>
      <View style={styles.chipRow}>
        {DIETS.map(option => (
          <Pressable
            key={option.value}
            onPress={() => onDietChange(option.value)}
            style={[
              styles.chip,
              diet === option.value && styles.chipActive,
            ]}>
            <Text
              style={[
                styles.chipText,
                diet === option.value && styles.chipTextActive,
              ]}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Model AI</Text>
        <Text style={styles.cardLine}>
          {isModelReady ? 'Gotowy do generowania.' : `Pobieranie/uruchamianie... ${downloadProgress}%`}
        </Text>
        {modelError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{modelError}</Text>
            <Pressable style={styles.secondaryButton} onPress={onRetryModel}>
              <Text style={styles.secondaryButtonText}>Sprobuj ponownie</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <Pressable
        onPress={onStart}
        disabled={!isModelReady}
        style={[styles.primaryButton, !isModelReady && styles.primaryButtonDisabled]}>
        <Text style={styles.primaryButtonText}>Generuj propozycje</Text>
      </Pressable>

      <View style={styles.debugCard}>
        <View style={styles.debugHeader}>
          <Text style={styles.cardTitle}>Debug</Text>
          <Pressable style={styles.secondaryButton} onPress={onToggleDebug}>
            <Text style={styles.secondaryButtonText}>
              {debugEnabled ? 'Wylacz' : 'Wlacz'}
            </Text>
          </Pressable>
        </View>

        {debugEnabled ? (
          <View style={styles.debugBody}>
            <Pressable style={styles.secondaryButton} onPress={onRefreshDebugSnapshot}>
              <Text style={styles.secondaryButtonText}>Odswiez snapshot SQLite</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={onResetNormalizedNames}>
              <Text style={styles.secondaryButtonText}>Reset normalized_name</Text>
            </Pressable>

            <Text style={styles.debugLabel}>Ostatnie logi</Text>
            <Text style={styles.debugBlock}>
              {debugEvents.length > 0 ? debugEvents.join('\n\n') : 'Brak logow debug.'}
            </Text>

            <Text style={styles.debugLabel}>Snapshot bazy</Text>
            <Text style={styles.debugBlock}>
              {debugSnapshot || 'Kliknij "Odswiez snapshot SQLite".'}
            </Text>
          </View>
        ) : (
          <Text style={styles.cardLine}>
            Po wlaczeniu debug zobaczysz prompty, odpowiedzi modelu i stan SQLite.
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: 12,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 4,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
  },
  chipActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  chipText: {
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 13,
  },
  chipTextActive: {
    color: colors.textPrimary,
  },
  card: {
    marginTop: 8,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderColor: colors.border,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  cardTitle: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 14,
  },
  cardLine: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  errorBox: {
    gap: 8,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
  },
  primaryButton: {
    backgroundColor: colors.success,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: colors.successText,
    fontWeight: '800',
    fontSize: 15,
  },
  secondaryButton: {
    backgroundColor: colors.surfaceSubtle,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 13,
  },
  debugCard: {
    marginTop: 8,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderColor: colors.border,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  debugHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  debugBody: {
    gap: 10,
  },
  debugLabel: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 12,
  },
  debugBlock: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
  },
});
