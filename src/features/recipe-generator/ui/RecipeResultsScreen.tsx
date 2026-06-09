import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../../theme/colors';
import { getDishImageSearchService } from '../application/dishImageSearchService';
import { DishImageResult } from '../domain/dishImageSearchTypes';
import { getPixabayApiKey } from '../recipeGeneratorConstants';
import { DishImageGallery } from './DishImageGallery';

type Props = {
  dishes: string[];
  onGenerateAgain: () => void;
  onBackToPreferences: () => void;
};

type DishImagesState = {
  loading: boolean;
  images: DishImageResult[];
};

function buildImagesByDish(
  dishList: string[],
  state: DishImagesState,
): Record<string, DishImagesState> {
  const out: Record<string, DishImagesState> = {};
  for (const dish of dishList) {
    out[dish] = state;
  }
  return out;
}

export function RecipeResultsScreen({
  dishes,
  onGenerateAgain,
  onBackToPreferences,
}: Props) {
  const [imagesByDish, setImagesByDish] = useState<Record<string, DishImagesState>>({});
  const imageSearchConfigured = getPixabayApiKey().length > 0;

  useEffect(() => {
    const dishList = Array.isArray(dishes) ? dishes : [];

    if (dishList.length === 0) {
      setImagesByDish({});
      return;
    }

    if (!imageSearchConfigured) {
      setImagesByDish(buildImagesByDish(dishList, { loading: false, images: [] }));
      return;
    }

    let cancelled = false;
    const imageSearchService = getDishImageSearchService();
    setImagesByDish(buildImagesByDish(dishList, { loading: true, images: [] }));

    dishList.forEach(dish => {
      imageSearchService
        .searchImagesForDish(dish)
        .then(images => {
          if (cancelled) {
            return;
          }
          setImagesByDish(prev => ({
            ...prev,
            [dish]: { loading: false, images },
          }));
        })
        .catch(() => {
          if (cancelled) {
            return;
          }
          setImagesByDish(prev => ({
            ...prev,
            [dish]: { loading: false, images: [] },
          }));
        });
    });

    return () => {
      cancelled = true;
    };
  }, [dishes, imageSearchConfigured]);

  const dishList = Array.isArray(dishes) ? dishes : [];

  return (
    <View style={styles.body}>
      <Text style={styles.title}>Propozycje dan</Text>
      <FlatList
        data={dishList}
        keyExtractor={(item, index) => `${index}-${item}`}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>Brak wynikow do wyswietlenia.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const imageState = imagesByDish[item] ?? { loading: true, images: [] };

          return (
            <View style={styles.row}>
              <Text style={styles.rowText}>{item}</Text>
              <DishImageGallery
                images={imageState.images}
                loading={imageState.loading}
                missingApiKey={!imageSearchConfigured}
              />
            </View>
          );
        }}
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
