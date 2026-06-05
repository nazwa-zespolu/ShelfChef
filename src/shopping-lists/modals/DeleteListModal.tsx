import React from 'react';
import {Modal, Pressable, StyleSheet, Text, View} from 'react-native';
import type {ShoppingListSummary} from '../../domain/types';
import {colors} from '../../theme/colors';
import {InlineFeedback, type FeedbackMessage} from '../components/InlineFeedback';

export function DeleteListModal({
  list,
  feedback,
  busy,
  onClose,
  onSubmit,
}: {
  list: ShoppingListSummary | null;
  feedback: FeedbackMessage | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Modal visible={list != null} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Usunąć listę?</Text>
          <Text style={styles.confirmText} numberOfLines={3}>
            {list?.name}
          </Text>
          <InlineFeedback feedback={feedback} />
          <View style={styles.actions}>
            <Pressable
              onPress={onClose}
              style={({pressed}) => [styles.secondaryButton, pressed && styles.pressed]}>
              <Text style={styles.secondaryButtonText}>Anuluj</Text>
            </Pressable>
            <Pressable
              disabled={busy}
              onPress={onSubmit}
              style={({pressed}) => [
                styles.dangerButton,
                busy && styles.disabled,
                pressed && styles.pressed,
              ]}>
              <Text style={styles.dangerButtonText}>Usuń</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
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
  title: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 12,
  },
  confirmText: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 14,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: colors.surfaceSubtle,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '900',
  },
  dangerButton: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: colors.danger,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerButtonText: {
    color: colors.successText,
    fontSize: 14,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.78,
  },
  disabled: {
    opacity: 0.45,
  },
});
