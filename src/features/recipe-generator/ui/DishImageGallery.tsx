import React from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors } from '../../../theme/colors';
import { DishImageResult } from '../domain/dishImageSearchTypes';
import { dishImagesPerResult } from '../recipeGeneratorConstants';

type Props = {
  images: DishImageResult[];
  loading: boolean;
  missingApiKey?: boolean;
};

export function DishImageGallery({ images, loading, missingApiKey }: Props) {
  if (missingApiKey) {
    return (
      <Text style={styles.emptyText}>
        Ustaw PIXABAY_API_KEY w pliku src/.env, aby pobierac zdjecia stockowe.
      </Text>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.success} size="small" />
          <Text style={styles.loadingText}>Szukam zdjec na Pixabay…</Text>
        </View>
        <View style={styles.placeholderRow}>
          {Array.from({ length: dishImagesPerResult }).map((_, index) => (
            <View key={index} style={styles.placeholder} />
          ))}
        </View>
      </View>
    );
  }

  if (images.length === 0) {
    return (
      <Text style={styles.emptyText}>Nie znaleziono zdjec tego dania.</Text>
    );
  }

  return (
    <View style={styles.resultsSection}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.imageRow}>
      {images.map(image => (
        <Pressable
          key={image.imageUrl}
          disabled={!image.sourcePageUrl}
          onPress={() => {
            if (image.sourcePageUrl) {
              Linking.openURL(image.sourcePageUrl).catch(() => {});
            }
          }}
          style={({ pressed }) => [styles.imageCard, pressed && styles.imageCardPressed]}>
          <Image source={{ uri: image.imageUrl }} style={styles.image} />
          <Text style={styles.sourceText} numberOfLines={2}>
            {image.sourceName ?? image.title ?? 'Zrodlo'}
          </Text>
        </Pressable>
      ))}
      </ScrollView>
      <Text style={styles.attribution}>Zdjecia: Pixabay</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
    marginTop: 10,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  placeholderRow: {
    flexDirection: 'row',
    gap: 8,
  },
  placeholder: {
    width: 112,
    height: 96,
    borderRadius: 10,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyText: {
    marginTop: 10,
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  resultsSection: {
    gap: 6,
    marginTop: 10,
  },
  imageRow: {
    gap: 8,
  },
  attribution: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  imageCard: {
    width: 112,
    gap: 4,
  },
  imageCardPressed: {
    opacity: 0.85,
  },
  image: {
    width: 112,
    height: 72,
    borderRadius: 10,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sourceText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 13,
  },
});
