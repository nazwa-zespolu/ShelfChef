import React, {useState} from 'react';
import {Image, StyleSheet, View} from 'react-native';
import type {ShoppingListIconColorKey, ShoppingListIconKey} from '../../domain/types';
import {
  getShoppingListIconColorDefinition,
  getShoppingListIconDefinition,
} from '../../shoppingListIcons';
import {colors} from '../../theme/colors';

export function ShoppingItemIconBubble({
  iconKey,
  iconColorKey,
  imageUrl,
  purchased = false,
}: {
  iconKey: ShoppingListIconKey;
  iconColorKey: ShoppingListIconColorKey;
  imageUrl?: string | null;
  purchased?: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const icon = getShoppingListIconDefinition(iconKey);
  const iconColor = getShoppingListIconColorDefinition(iconColorKey);
  const Icon = icon.Icon;
  const shouldShowImage = imageUrl != null && imageUrl.trim().length > 0 && !imageFailed;

  return (
    <View
      style={[
        styles.icon,
        {backgroundColor: iconColor.background},
        shouldShowImage && styles.imageBubble,
        purchased && styles.purchased,
      ]}>
      {shouldShowImage ? (
        <Image
          source={{uri: imageUrl}}
          style={styles.image}
          resizeMode="cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <Icon
          color={purchased ? colors.success : iconColor.color}
          size={24}
          strokeWidth={2.1}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  icon: {
    width: 46,
    height: 46,
    borderRadius: 999,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageBubble: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  purchased: {
    backgroundColor: colors.accentSoft,
  },
});
