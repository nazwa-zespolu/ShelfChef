import React, {useEffect, useMemo, useState} from 'react';
import {Image, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {CalendarDays, Package} from 'lucide-react-native';
import type {InventoryItem} from '../domain/types';
import {colors} from '../theme/colors';
import {DraggableBottomSheet} from '../shopping-lists/modals/DraggableBottomSheet';
import WheelPicker from './WheelPicker';

export type ProductDetailsChanges = {
  expiryDate: string | null;
  openedAt: string | null;
};

type DatePart = 'day' | 'month' | 'year';

function getDefaultExpiryDate() {
  const date = new Date();
  date.setDate(date.getDate() + 2);
  return date;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function parseExpiryDate(value: string | null): Date | null {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function formatExpiryForDatabase(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatExpiryForDisplay(date: Date) {
  return date.toLocaleDateString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function ProductDetailsModal({
  item,
  busy,
  errorMessage,
  onClose,
  onSave,
}: {
  item: InventoryItem | null;
  busy: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSave: (changes: ProductDetailsChanges) => void;
}) {
  const [expiryDate, setExpiryDate] = useState<Date | null>(null);
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  useEffect(() => {
    if (!item) {
      return;
    }
    setExpiryDate(parseExpiryDate(item.expiryDate));
    setOpenedAt(item.isOpened ? item.openedAt ?? new Date().toISOString() : null);
    setDatePickerVisible(false);
    setScrollEnabled(true);
  }, [item]);

  const currentYear = new Date().getFullYear();
  const selectedYear = expiryDate?.getFullYear() ?? currentYear;
  const years = useMemo(() => {
    const firstYear = Math.min(currentYear - 5, selectedYear);
    const lastYear = Math.max(currentYear + 10, selectedYear);
    return Array.from({length: lastYear - firstYear + 1}, (_, index) => firstYear + index);
  }, [currentYear, selectedYear]);
  const months = useMemo(() => Array.from({length: 12}, (_, index) => index + 1), []);
  const activeMonth = expiryDate?.getMonth() ?? new Date().getMonth();
  const days = useMemo(
    () =>
      Array.from(
        {length: getDaysInMonth(selectedYear, activeMonth + 1)},
        (_, index) => index + 1,
      ),
    [activeMonth, selectedYear],
  );

  const updateDatePart = (part: DatePart, value: number) => {
    setExpiryDate(current => {
      const base = current ?? getDefaultExpiryDate();
      const nextYear = part === 'year' ? value : base.getFullYear();
      const nextMonth = part === 'month' ? value : base.getMonth() + 1;
      const maxDay = getDaysInMonth(nextYear, nextMonth);
      const nextDay = part === 'day' ? value : Math.min(base.getDate(), maxDay);
      return new Date(nextYear, nextMonth - 1, Math.min(nextDay, maxDay));
    });
  };

  const close = () => {
    if (!busy) {
      onClose();
    }
  };

  const submit = () => {
    if (busy) {
      return;
    }
    onSave({
      expiryDate: expiryDate ? formatExpiryForDatabase(expiryDate) : null,
      openedAt,
    });
  };

  const metadata = item
    ? [item.brand?.trim(), item.category?.trim()].filter(Boolean).join(' · ')
    : '';

  return (
    <DraggableBottomSheet
      visible={item != null}
      accessibilityLabel="Zamknij szczegóły produktu"
      onClose={close}
      sheetStyle={styles.sheet}
      handleStyle={styles.handleTouch}>
      {item ? (
        <View style={styles.content}>
          <Text style={styles.title}>Szczegóły produktu</Text>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            nestedScrollEnabled
            scrollEnabled={scrollEnabled}
            showsVerticalScrollIndicator={false}>
            <View style={styles.productHeader}>
              {item.imageUrl ? (
                <Image source={{uri: item.imageUrl}} style={styles.productImage} />
              ) : (
                <View style={styles.productImagePlaceholder}>
                  <Package color={colors.textMuted} size={30} strokeWidth={2} />
                </View>
              )}
              <View style={styles.productCopy}>
                <Text style={styles.productName} numberOfLines={2}>
                  {item.name}
                </Text>
                {metadata ? <Text style={styles.productMetadata}>{metadata}</Text> : null}
                <Text style={styles.productEan}>
                  {item.ean ? `EAN: ${item.ean}` : 'Produkt dodany ręcznie'}
                </Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Termin ważności</Text>
            <Pressable
              testID="product-expiry-field"
              disabled={busy}
              onPress={() => {
                setExpiryDate(current => current ?? getDefaultExpiryDate());
                setDatePickerVisible(current => !current);
              }}
              style={({pressed}) => [styles.dateField, pressed && styles.pressed]}>
              <CalendarDays color={colors.accent} size={22} strokeWidth={2.2} />
              <View style={styles.dateCopy}>
                <Text style={styles.dateLabel}>{expiryDate ? 'Ważne do' : 'Brak terminu'}</Text>
                <Text style={styles.dateValue}>
                  {expiryDate ? formatExpiryForDisplay(expiryDate) : 'Dodaj termin ważności'}
                </Text>
              </View>
              <Text style={styles.dateAction}>{expiryDate ? 'Zmień' : 'Dodaj'}</Text>
            </Pressable>

            {expiryDate ? (
              <Pressable
                testID="product-expiry-remove"
                disabled={busy}
                onPress={() => {
                  setExpiryDate(null);
                  setDatePickerVisible(false);
                }}
                style={({pressed}) => [styles.removeDateButton, pressed && styles.pressed]}>
                <Text style={styles.removeDateText}>Usuń termin</Text>
              </Pressable>
            ) : null}

            {expiryDate && datePickerVisible ? (
              <View style={styles.wheelsRow} testID="product-expiry-picker">
                <WheelPicker
                  label="Dzień"
                  values={days}
                  selectedValue={expiryDate.getDate()}
                  onValueChange={value => updateDatePart('day', value)}
                  onInteractionStart={() => setScrollEnabled(false)}
                  onInteractionEnd={() => setScrollEnabled(true)}
                />
                <WheelPicker
                  label="Miesiąc"
                  values={months}
                  selectedValue={expiryDate.getMonth() + 1}
                  onValueChange={value => updateDatePart('month', value)}
                  onInteractionStart={() => setScrollEnabled(false)}
                  onInteractionEnd={() => setScrollEnabled(true)}
                />
                <WheelPicker
                  label="Rok"
                  values={years}
                  selectedValue={expiryDate.getFullYear()}
                  onValueChange={value => updateDatePart('year', value)}
                  onInteractionStart={() => setScrollEnabled(false)}
                  onInteractionEnd={() => setScrollEnabled(true)}
                />
              </View>
            ) : null}

            <Text style={styles.sectionTitle}>Stan produktu</Text>
            <View style={styles.stateControl}>
              <Pressable
                testID="product-state-closed"
                disabled={busy}
                onPress={() => setOpenedAt(null)}
                style={({pressed}) => [
                  styles.stateButton,
                  openedAt === null && styles.stateButtonSelected,
                  pressed && styles.pressed,
                ]}>
                <Text
                  style={[
                    styles.stateButtonText,
                    openedAt === null && styles.stateButtonTextSelected,
                  ]}>
                  Zamknięty
                </Text>
              </Pressable>
              <Pressable
                testID="product-state-opened"
                disabled={busy}
                onPress={() => setOpenedAt(current => current ?? new Date().toISOString())}
                style={({pressed}) => [
                  styles.stateButton,
                  openedAt !== null && styles.stateButtonSelected,
                  pressed && styles.pressed,
                ]}>
                <Text
                  style={[
                    styles.stateButtonText,
                    openedAt !== null && styles.stateButtonTextSelected,
                  ]}>
                  Otwarty
                </Text>
              </Pressable>
            </View>

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable
              testID="product-details-cancel"
              disabled={busy}
              onPress={close}
              style={({pressed}) => [
                styles.actionButton,
                styles.cancelButton,
                busy && styles.disabled,
                pressed && styles.pressed,
              ]}>
              <Text style={styles.cancelButtonText}>Anuluj</Text>
            </Pressable>
            <Pressable
              testID="product-details-save"
              disabled={busy}
              onPress={submit}
              style={({pressed}) => [
                styles.actionButton,
                styles.saveButton,
                busy && styles.disabled,
                pressed && styles.pressed,
              ]}>
              <Text style={styles.saveButtonText}>{busy ? 'Zapisuję…' : 'Zapisz zmiany'}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </DraggableBottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingTop: 4,
    maxHeight: '92%',
  },
  handleTouch: {
    alignSelf: 'stretch',
    width: 'auto',
    minHeight: 44,
    marginHorizontal: -16,
    marginTop: -4,
    marginBottom: -8,
    paddingHorizontal: 16,
    justifyContent: 'flex-start',
    paddingTop: 10,
  },
  content: {
    flexShrink: 1,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 23,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 14,
  },
  scroll: {
    flexShrink: 1,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  productHeader: {
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 12,
    marginBottom: 18,
  },
  productImage: {
    width: 68,
    height: 68,
    borderRadius: 8,
    resizeMode: 'cover',
  },
  productImagePlaceholder: {
    width: 68,
    height: 68,
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productCopy: {
    flex: 1,
    minWidth: 0,
  },
  productName: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '900',
  },
  productMetadata: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 4,
  },
  productEan: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 8,
  },
  dateField: {
    minHeight: 64,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dateCopy: {
    flex: 1,
  },
  dateLabel: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  dateValue: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 2,
  },
  dateAction: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '900',
  },
  removeDateButton: {
    alignSelf: 'flex-end',
    paddingVertical: 9,
    paddingHorizontal: 4,
    marginBottom: 2,
  },
  removeDateText: {
    color: colors.warning,
    fontSize: 13,
    fontWeight: '800',
  },
  wheelsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    marginBottom: 16,
  },
  stateControl: {
    flexDirection: 'row',
    gap: 8,
    padding: 4,
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted,
    marginBottom: 10,
  },
  stateButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateButtonSelected: {
    backgroundColor: colors.success,
  },
  stateButtonText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '800',
  },
  stateButtonTextSelected: {
    color: colors.successText,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
  },
  cancelButtonText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '900',
  },
  saveButton: {
    backgroundColor: colors.success,
  },
  saveButtonText: {
    color: colors.successText,
    fontSize: 15,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.78,
  },
  disabled: {
    opacity: 0.45,
  },
});
