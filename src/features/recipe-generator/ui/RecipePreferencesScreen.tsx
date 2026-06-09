import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../../theme/colors';
import { DietPreference, DishType } from '../domain/recipeGenerationTypes';

type Props = {
  dishType: DishType;
  diet: DietPreference;
  skipCategorization: boolean;
  isModelReady: boolean;
  downloadProgress: number;
  modelError: string | null;
  onDishTypeChange: (value: DishType) => void;
  onDietChange: (value: DietPreference) => void;
  onSkipCategorizationChange: (value: boolean) => void;
  onStart: () => void;
  onRetryModel: () => void;
  debugEnabled: boolean;
  debugSnapshot: string;
  debugEvents: string[];
  onToggleDebug: () => void;
  onRefreshDebugSnapshot: () => void;
  onResetDietaryCategorization: () => void;
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
  skipCategorization,
  isModelReady,
  downloadProgress,
  modelError,
  onDishTypeChange,
  onDietChange,
  onSkipCategorizationChange,
  onStart,
  onRetryModel,
  debugEnabled,
  debugSnapshot,
  debugEvents,
  onToggleDebug,
  onRefreshDebugSnapshot,
  onResetDietaryCategorization,
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

      <Pressable
        onPress={() => onSkipCategorizationChange(!skipCategorization)}
        style={[
          styles.skipCategorizationRow,
          skipCategorization && styles.skipCategorizationRowActive,
        ]}>
        <View
          style={[
            styles.skipCategorizationCheckbox,
            skipCategorization && styles.skipCategorizationCheckboxActive,
          ]}>
          {skipCategorization ? (
            <Text style={styles.skipCategorizationCheckmark}>✓</Text>
          ) : null}
        </View>
        <View style={styles.skipCategorizationTextBlock}>
          <Text style={styles.skipCategorizationTitle}>
            Pomin kategoryzacje produktow
          </Text>
          <Text style={styles.skipCategorizationHint}>
            Przydatne przy diecie bez ograniczen lub low-carb — szybsze
            generowanie bez oceny produktow przez model.
          </Text>
        </View>
      </Pressable>

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
            <Pressable
              style={styles.secondaryButton}
              onPress={onResetDietaryCategorization}>
              <Text style={styles.secondaryButtonText}>Reset kategoryzacji diet</Text>
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
  skipCategorizationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
  },
  skipCategorizationRowActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  skipCategorizationCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  skipCategorizationCheckboxActive: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  skipCategorizationCheckmark: {
    color: colors.successText,
    fontWeight: '800',
    fontSize: 14,
    lineHeight: 16,
  },
  skipCategorizationTextBlock: {
    flex: 1,
    gap: 4,
  },
  skipCategorizationTitle: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 14,
  },
  skipCategorizationHint: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
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
