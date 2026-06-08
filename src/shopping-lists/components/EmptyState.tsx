import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {colors} from '../../theme/colors';

export function EmptyState({
  title,
  description,
  details = [],
}: {
  title: string;
  description?: string;
  details?: string[];
}) {
  return (
    <View style={styles.box}>
      <Text style={styles.title}>{title}</Text>
      {description ? (
        <Text style={styles.description}>{description}</Text>
      ) : null}
      {details.length > 0 ? (
        <View style={styles.details}>
          {details.map(detail => (
            <Text key={detail} style={styles.detailText}>
              {detail}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    padding: 28,
  },
  title: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  description: {
    maxWidth: 300,
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
  },
  details: {
    marginTop: 12,
    gap: 4,
    alignItems: 'center',
  },
  detailText: {
    maxWidth: 310,
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    textAlign: 'center',
  },
});
