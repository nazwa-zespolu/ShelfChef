import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../../theme/colors';
import { RecipeGenerationProgressStage } from '../domain/recipeGenerationTypes';

type Props = {
  stage: RecipeGenerationProgressStage;
  error: string | null;
  isGenerating: boolean;
  onCancel: () => void;
  onRetry: () => void;
  onBack: () => void;
};

const STAGE_LABELS: Record<RecipeGenerationProgressStage, string> = {
  normalizing: 'Normalizowanie skladnikow',
  generating: 'Generowanie propozycji',
  parsing: 'Parsowanie odpowiedzi JSON',
  done: 'Gotowe',
};

export function RecipeGenerationProgressScreen({
  stage,
  error,
  isGenerating,
  onCancel,
  onRetry,
  onBack,
}: Props) {
  return (
    <View style={styles.body}>
      <View style={styles.card}>
        <Text style={styles.title}>Generowanie przepisow</Text>
        <View style={styles.row}>
          <ActivityIndicator color={colors.success} animating={isGenerating} />
          <Text style={styles.stageText}>{STAGE_LABELS[stage]}</Text>
        </View>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Nie udalo sie wygenerowac</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        {isGenerating ? (
          <Pressable style={styles.secondaryButton} onPress={onCancel}>
            <Text style={styles.secondaryButtonText}>Stop</Text>
          </Pressable>
        ) : null}
        {error ? (
          <Pressable style={styles.primaryButton} onPress={onRetry}>
            <Text style={styles.primaryButtonText}>Sprobuj ponownie</Text>
          </Pressable>
        ) : null}
        <Pressable style={styles.secondaryButton} onPress={onBack}>
          <Text style={styles.secondaryButtonText}>Wroc do ustawien</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderColor: colors.border,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stageText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  errorBox: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
    borderColor: colors.border,
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  errorTitle: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 14,
  },
  errorText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    gap: 10,
  },
  primaryButton: {
    backgroundColor: colors.success,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: colors.successText,
    fontSize: 14,
    fontWeight: '800',
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
    fontSize: 14,
    fontWeight: '700',
  },
});
