import React from 'react';
import {Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {Search} from 'lucide-react-native';
import type {AutoShoppingListItemState, CatalogProduct} from '../../domain/types';
import {DEFAULT_SHOPPING_LIST_ICON_COLOR_KEY} from '../../shoppingListIcons';
import {colors} from '../../theme/colors';
import {InlineFeedback, type FeedbackMessage} from '../components/InlineFeedback';
import {ShoppingItemIconBubble} from '../components/ShoppingItemIconBubble';
import {useKeyboardVisible} from '../hooks/useKeyboardVisible';
import {DraggableBottomSheet} from './DraggableBottomSheet';

export function CatalogLinksModal({
  item,
  query,
  results,
  feedback,
  busy,
  onChangeQuery,
  onLink,
  onUnlink,
  onClose,
}: {
  item: AutoShoppingListItemState | null;
  query: string;
  results: CatalogProduct[];
  feedback: FeedbackMessage | null;
  busy: boolean;
  onChangeQuery: (query: string) => void;
  onLink: (product: CatalogProduct) => void;
  onUnlink: (catalogProductId: string) => void;
  onClose: () => void;
}) {
  const linkedIds = new Set(item?.linkedCatalogProducts.map(product => product.id) ?? []);
  const availableResults = results.filter(product => !linkedIds.has(product.id));
  const searchActive = query.trim().length > 0;
  const keyboardVisible = useKeyboardVisible(item == null);

  return (
    <DraggableBottomSheet
      visible={item != null}
      accessibilityLabel="Zamknij okno powiązań"
      onClose={onClose}
      sheetStyle={[styles.sheet, keyboardVisible && styles.sheetKeyboard]}
      handleStyle={styles.handleTouch}>
      <Text style={styles.title} numberOfLines={2}>
        Produkty pasujące do: {item?.label}
      </Text>
      <Text style={styles.subtitle}>
        Te produkty będą liczone jako ta pozycja
      </Text>
      <InlineFeedback feedback={feedback} />

      <View style={styles.searchBox}>
        <Search color={colors.textMuted} size={22} strokeWidth={2.1} />
        <TextInput
          value={query}
          onChangeText={onChangeQuery}
          placeholder="Szukaj w katalogu"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
        />
      </View>
      {searchActive ? (
        <>
          <Text style={styles.sectionTitle}>Wyniki</Text>
          {availableResults.length > 0 ? (
            <ScrollView
              style={[styles.results, keyboardVisible && styles.resultsKeyboard]}
              keyboardShouldPersistTaps="handled">
              {availableResults.map(product => (
                <CatalogLinkCard
                  key={product.id}
                  product={product}
                  actionLabel="Dodaj"
                  busy={busy}
                  onPress={() => {
                    onLink(product);
                    onChangeQuery('');
                  }}
                />
              ))}
            </ScrollView>
          ) : (
            <EmptyResults label="Brak wyników" />
          )}
        </>
      ) : (
        <>
          <Text style={styles.sectionTitle}>Powiązane</Text>
          {item && item.linkedCatalogProducts.length > 0 ? (
            item.linkedCatalogProducts.map(product => (
              <CatalogLinkCard
                key={product.id}
                product={product}
                actionLabel="Usuń"
                busy={busy}
                onPress={() => onUnlink(product.id)}
              />
            ))
          ) : (
            <EmptyResults label="Brak powiązanych produktów" />
          )}
        </>
      )}
    </DraggableBottomSheet>
  );
}

function CatalogLinkCard({
  product,
  actionLabel,
  busy,
  onPress,
}: {
  product: CatalogProduct;
  actionLabel: string;
  busy: boolean;
  onPress: () => void;
}) {
  return (
    <View style={styles.card}>
      <ShoppingItemIconBubble
        iconKey="box"
        iconColorKey={DEFAULT_SHOPPING_LIST_ICON_COLOR_KEY}
        imageUrl={product.imageUrl}
      />
      <View style={styles.cardText}>
        <Text style={styles.cardName} numberOfLines={1}>{product.name}</Text>
        <Text style={styles.cardMeta}>
          {product.kind === 'specific' ? 'Produkt z EAN' : 'Produkt z katalogu'}
        </Text>
      </View>
      <Pressable
        disabled={busy}
        onPress={onPress}
        style={({pressed}) => [
          styles.outlineButton,
          busy && styles.disabled,
          pressed && styles.pressed,
        ]}>
        <Text style={styles.outlineButtonText}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

function EmptyResults({label}: {label: string}) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingTop: 6,
    maxHeight: '78%',
  },
  sheetKeyboard: {
    height: '94%',
    maxHeight: '94%',
  },
  handleTouch: {
    alignSelf: 'stretch',
    width: 'auto',
    minHeight: 58,
    marginHorizontal: -16,
    marginTop: -10,
    marginBottom: -18,
    paddingHorizontal: 16,
    justifyContent: 'flex-start',
    paddingTop: 8,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 0,
    marginBottom: 4,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },
  searchBox: {
    minHeight: 52,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 15,
    paddingVertical: 0,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 10,
  },
  results: {
    maxHeight: 260,
  },
  resultsKeyboard: {
    maxHeight: 430,
  },
  card: {
    minHeight: 72,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: colors.shadow,
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 5},
    elevation: 3,
  },
  cardText: {
    flex: 1,
    minWidth: 0,
  },
  cardName: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '900',
  },
  cardMeta: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 3,
  },
  outlineButton: {
    minHeight: 42,
    minWidth: 84,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  outlineButtonText: {
    color: colors.success,
    fontSize: 14,
    fontWeight: '900',
  },
  empty: {
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.78,
  },
  disabled: {
    opacity: 0.45,
  },
});
