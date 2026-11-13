import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Check, ClipboardList, Package, Search} from 'lucide-react-native';
import {colors} from '../../theme/colors';

export function EmptyState({
  title,
  description,
  details = [],
  variant = 'products',
  compact = false,
}: {
  title: string;
  description?: string;
  details?: string[];
  variant?: 'products' | 'lists' | 'search' | 'complete';
  compact?: boolean;
}) {
  const Icon = {products: Package, lists: ClipboardList, search: Search, complete: Check}[variant];
  return (
    <View style={[styles.box, compact && styles.compact]}>
      <Icon color={variant === 'complete' ? colors.success : colors.textMuted} size={compact ? 24 : 32} strokeWidth={2} />
      <Text style={[styles.title, compact && styles.compactTitle]}>{title}</Text>
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
  compact: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  title: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 12,
    flexShrink: 1,
  },
  compactTitle: {
    marginTop: 0,
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
