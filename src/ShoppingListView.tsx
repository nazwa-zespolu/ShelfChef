import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {colors} from './theme/colors';

type ShoppingListViewProps = {
  onRequestClose?: () => void;
};

export default function ShoppingListView(_: ShoppingListViewProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, {paddingTop: insets.top + 8}]}>
      <View style={styles.body}>
        <Text style={styles.title}>Lista zakupów</Text>
        <Text style={styles.hint}>
          Tutaj zapiszesz listy produktów do kupienia i zsynchronizujesz je z zapasami po zakupach. Implementacja
          bazy (tabele list zakupowych) zostanie rozszerzona zgodnie z planem persystencji.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  body: {
    flex: 1,
    padding: 20,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 12,
  },
  hint: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
});
