import React from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {ShoppingBag} from 'lucide-react-native';
import type {ShoppingListSummary, ShoppingSuggestion} from '../../domain/types';
import {DEFAULT_SHOPPING_LIST_ICON_COLOR_KEY} from '../../shoppingListIcons';
import {colors} from '../../theme/colors';
import {EmptyState} from '../components/EmptyState';
import {ShoppingItemIconBubble} from '../components/ShoppingItemIconBubble';

type ReplenishmentSuggestionsScreenProps = {
  suggestions: ShoppingSuggestion[];
  manualLists: ShoppingListSummary[];
  targetListId: string | null;
  busy: boolean;
  loading: boolean;
  onBack: () => void;
  onSelectTargetList: (listId: string) => void;
  onMergeSuggestions: () => void;
  onRefresh: () => void;
};

export function ReplenishmentSuggestionsScreen({
  suggestions,
  manualLists,
  targetListId,
  busy,
  loading,
  onBack,
  onSelectTargetList,
  onMergeSuggestions,
  onRefresh,
}: ReplenishmentSuggestionsScreenProps) {
  const mergeDisabled = !targetListId || suggestions.length === 0 || busy;

  return (
    <View style={styles.content}>
      <View style={styles.suggestionsHero}>
        <Pressable
          onPress={onBack}
          style={({pressed}) => [styles.backButton, pressed && styles.pressed]}
          hitSlop={10}>
          <Text style={styles.backText}>‹ Wróć</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>Do uzupełnienia</Text>
        <Text style={styles.meta}>
          {suggestions.length === 1 ? '1 produkt do kupienia' : `${suggestions.length} produkty do kupienia`}
        </Text>
      </View>
      <View style={styles.mergeBar}>
        <Text style={styles.mergeLabel}>Dodaj do listy</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.targetRow}>
          {manualLists.map(list => {
            const active = targetListId === list.id;
            return (
              <Pressable
                key={list.id}
                onPress={() => onSelectTargetList(list.id)}
                style={({pressed}) => [
                  styles.targetChip,
                  active && styles.targetChipActive,
                  pressed && styles.pressed,
                ]}>
                <Text style={[styles.targetChipText, active && styles.targetChipTextActive]}>
                  {list.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Pressable
          disabled={mergeDisabled}
          onPress={onMergeSuggestions}
          style={({pressed}) => [
            styles.primaryButton,
            styles.mergeButton,
            mergeDisabled && styles.disabled,
            pressed && styles.pressed,
          ]}>
          <View style={styles.inlineButtonContent}>
            <ShoppingBag color={colors.successText} size={20} strokeWidth={2.2} />
            <Text style={styles.primaryButtonText}>Dodaj do listy</Text>
          </View>
        </Pressable>
      </View>
      <FlatList
        data={suggestions}
        keyExtractor={item => item.catalogProductId ?? `text:${item.normalizedName}`}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={colors.success} />
        }
        contentContainerStyle={[
          styles.suggestionsContent,
          suggestions.length === 0 && styles.emptyContent,
        ]}
        renderItem={({item}) => (
          <View style={styles.suggestionItemCard}>
            <ShoppingItemIconBubble
              iconKey={item.iconKey ?? 'box'}
              iconColorKey={item.iconColorKey ?? DEFAULT_SHOPPING_LIST_ICON_COLOR_KEY}
              imageUrl={item.imageUrl}
            />
            <View style={styles.suggestionItemText}>
              <Text style={styles.itemTitle} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.itemMeta} numberOfLines={1}>{item.reason}</Text>
              <Text style={styles.suggestionSourceText} numberOfLines={1}>
                {item.sourceAutoListNames.join(', ')}
              </Text>
            </View>
            <View style={styles.suggestionMissingPill}>
              <Text style={styles.suggestionMissingText}>Brakuje {item.missingQuantity}</Text>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <EmptyState
            title="Wszystko uzupełnione"
            description="Braki z aktywnych list auto pojawią się tutaj."
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  suggestionsHero: {
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 14,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
  },
  backText: {
    color: colors.accent,
    fontSize: 17,
    fontWeight: '800',
  },
  title: {
    color: colors.textPrimary,
    fontSize: 38,
    fontWeight: '900',
  },
  meta: {
    color: colors.textSecondary,
    fontSize: 15,
    marginTop: 8,
  },
  mergeBar: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 12,
  },
  mergeLabel: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '900',
  },
  targetRow: {
    gap: 10,
    paddingRight: 16,
  },
  targetChip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 44,
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  targetChipActive: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  targetChipText: {
    color: colors.textSecondary,
    fontWeight: '900',
    fontSize: 14,
  },
  targetChipTextActive: {
    color: colors.successText,
  },
  primaryButton: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: colors.success,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: colors.successText,
    fontSize: 14,
    fontWeight: '900',
  },
  inlineButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  mergeButton: {
    flex: 0,
    minHeight: 46,
    alignSelf: 'stretch',
  },
  suggestionsContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  suggestionItemCard: {
    minHeight: 92,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 6},
    elevation: 3,
    marginBottom: 12,
  },
  suggestionItemText: {
    flex: 1,
    minWidth: 0,
  },
  suggestionSourceText: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 8,
  },
  suggestionMissingPill: {
    minHeight: 36,
    borderRadius: 8,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  suggestionMissingText: {
    color: colors.warning,
    fontSize: 12,
    fontWeight: '900',
  },
  itemTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '900',
  },
  itemMeta: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 4,
  },
  pressed: {
    opacity: 0.78,
  },
  disabled: {
    opacity: 0.45,
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
});
