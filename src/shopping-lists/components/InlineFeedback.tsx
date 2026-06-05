import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Check, X} from 'lucide-react-native';
import {colors} from '../../theme/colors';

export type FeedbackTone = 'success' | 'error';

export type FeedbackMessage = {
  message: string;
  tone: FeedbackTone;
};

export function InlineFeedback({feedback}: {feedback: FeedbackMessage | null}) {
  if (!feedback) {
    return null;
  }

  return (
    <View style={[styles.feedback, feedback.tone === 'error' && styles.error]}>
      {feedback.tone === 'error' ? (
        <X color={colors.danger} size={16} strokeWidth={3} />
      ) : (
        <Check color={colors.success} size={16} strokeWidth={3} />
      )}
      <Text style={styles.text} numberOfLines={1}>
        {feedback.message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  feedback: {
    minHeight: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.success,
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  error: {
    borderColor: colors.danger,
  },
  text: {
    flexShrink: 1,
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '900',
  },
});
