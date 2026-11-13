import {StyleSheet} from 'react-native';
import {colors} from './colors';

// Space inside scrolling viewports for the blur beyond the surface bounds.
export const shadowInsets = {
  control: {horizontal: 8, top: 6, bottom: 12},
  card: {horizontal: 16, top: 8, bottom: 20},
} as const;

export const shadowGutters = StyleSheet.create({
  viewport: {marginHorizontal: -shadowInsets.card.horizontal},
  content: {
    paddingHorizontal: shadowInsets.card.horizontal,
    paddingTop: shadowInsets.card.top,
    paddingBottom: shadowInsets.card.bottom,
  },
});

export const shadows = StyleSheet.create({
  control: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 3},
    elevation: 1,
  },
  preview: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 4},
    elevation: 2,
  },
  card: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 6},
    elevation: 3,
  },
});
