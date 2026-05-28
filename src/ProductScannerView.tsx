import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Button,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import WheelPicker from './components/WheelPicker';
import {ProductDefinition} from './domain/types';
import {getProductRepository, getScanToAdd} from './app/services';
import {colors} from './theme/colors';

const visionCamera = (() => {
  try {
    // Runtime require keeps Jest/tests working when native module is missing.
    return require('react-native-vision-camera');
  } catch {
    return null;
  }
})();

const BOTTOM_SHEET_HEIGHT = 300;

function getDefaultExpirationDate() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function formatDate(day: number, month: number, year: number) {
  const dd = String(day).padStart(2, '0');
  const mm = String(month).padStart(2, '0');
  return `${dd}.${mm}.${year}`;
}

function formatExpiryForDb(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function generateInventoryId(index: number) {
  return `inv-${Date.now()}-${index}-${Math.floor(Math.random() * 1_000_000)}`;
}

function isValidEAN(code: string) {
  if (!/^\d+$/.test(code)) {
    return false;
  }

  if (code.length !== 8 && code.length !== 13) {
    return false;
  }

  const digits = code.split('').map(Number);
  const checksum = digits.pop() as number;
  const weightedSum = digits
    .reverse()
    .reduce((sum, digit, index) => sum + digit * (index % 2 === 0 ? 3 : 1), 0);
  const calculatedChecksum = (10 - (weightedSum % 10)) % 10;

  return calculatedChecksum === checksum;
}

function ScannerUnavailable({onRequestClose}: {onRequestClose?: () => void}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.center}>
      {onRequestClose ? (
        <Pressable
          onPress={onRequestClose}
          style={[styles.backOverlay, {top: Math.max(insets.top, 12)}]}
          hitSlop={12}>
          <Text style={styles.backText}>&#8592; Wróć</Text>
        </Pressable>
      ) : null}
      <Text style={styles.title}>Scanner unavailable</Text>
      <Text style={styles.info}>Missing scanner library or permission denied.</Text>
    </View>
  );
}

type ProductScannerViewProps = {
  onRequestClose: () => void;
  onProductAdded?: () => void;
};

type VisionCameraModule = {
  Camera: React.ComponentType<any>;
  useCameraPermission: () => {
    hasPermission: boolean;
    requestPermission: () => Promise<boolean>;
  };
  useCameraDevice: (cameraPosition: 'front' | 'back') => any;
  useCodeScanner: (args: {
    codeTypes: string[];
    onCodeScanned: (codes: Array<{value?: string}>) => void;
  }) => any;
};

type SheetMode = 'none' | 'details' | 'manualWithEan' | 'manualNoEan';

function ProductScannerVisionContent({
  onRequestClose,
  onProductAdded,
  visionModule,
}: {
  onRequestClose: () => void;
  onProductAdded?: () => void;
  visionModule: VisionCameraModule;
}) {
  const {Camera, useCameraPermission, useCameraDevice, useCodeScanner} = visionModule;
  const insets = useSafeAreaInsets();
  const {hasPermission, requestPermission} = useCameraPermission();
  const device = useCameraDevice('back');
  const [scannedProduct, setScannedProduct] = useState<ProductDefinition | null>(null);
  const [sheetMode, setSheetMode] = useState<SheetMode>('none');
  const [manualEan, setManualEan] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualBrand, setManualBrand] = useState('');
  const [manualCategory, setManualCategory] = useState('');
  const [manualCustomName, setManualCustomName] = useState('');
  const [expirationDate, setExpirationDate] = useState<Date | null>(getDefaultExpirationDate);
  const [amount, setAmount] = useState(1);
  const [resolving, setResolving] = useState(false);
  const [adding, setAdding] = useState(false);
  const sheetTranslateY = useRef(new Animated.Value(BOTTOM_SHEET_HEIGHT)).current;
  const lastAcceptedScanRef = useRef<{code: string; scannedAt: number} | null>(null);
  const resolveRequestIdRef = useRef(0);
  const scanToAdd = useMemo(() => getScanToAdd(), []);
  const repo = useMemo(() => getProductRepository(), []);
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const years = useMemo(
    () => Array.from({length: 11}, (_, index) => currentYear + index),
    [currentYear],
  );
  const months = useMemo(() => Array.from({length: 12}, (_, index) => index + 1), []);
  const activeDate = expirationDate ?? getDefaultExpirationDate();
  const days = useMemo(
    () =>
      Array.from(
        {length: getDaysInMonth(activeDate.getFullYear(), activeDate.getMonth() + 1)},
        (_, index) => index + 1,
      ),
    [activeDate],
  );

  const resetCommonFormState = () => {
    setExpirationDate(getDefaultExpirationDate());
    setAmount(1);
  };

  const resetManualWithEanForm = (ean: string) => {
    setManualEan(ean);
    setManualName('');
    setManualBrand('');
    setManualCategory('');
  };

  const openManualWithEanForm = (ean: string) => {
    setScannedProduct(null);
    resetCommonFormState();
    resetManualWithEanForm(ean);
    setSheetMode('manualWithEan');
  };

  const openManualNoEanForm = () => {
    setScannedProduct(null);
    resetCommonFormState();
    setManualCustomName('');
    setSheetMode('manualNoEan');
  };

  const closeBottomSheet = () => {
    setSheetMode('none');
    setScannedProduct(null);
  };

  const updateDatePart = (part: 'day' | 'month' | 'year', value: number) => {
    setExpirationDate(currentDate => {
      const nextDate = new Date(currentDate ?? getDefaultExpirationDate());
      const nextYear = part === 'year' ? value : nextDate.getFullYear();
      const nextMonth = part === 'month' ? value : nextDate.getMonth() + 1;
      const maxDay = getDaysInMonth(nextYear, nextMonth);
      const nextDay = part === 'day' ? value : Math.min(nextDate.getDate(), maxDay);
      nextDate.setFullYear(nextYear, nextMonth - 1, nextDay);
      return nextDate;
    });
  };

  useEffect(() => {
    Animated.timing(sheetTranslateY, {
      toValue: sheetMode !== 'none' || resolving ? 0 : BOTTOM_SHEET_HEIGHT,
      duration: 250,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [resolving, sheetMode, sheetTranslateY]);

  const resolveScannedProduct = async (ean: string) => {
    const requestId = resolveRequestIdRef.current + 1;
    resolveRequestIdRef.current = requestId;
    setScannedProduct(null);
    setSheetMode('none');
    resetCommonFormState();
    setResolving(true);

    const result = await scanToAdd.execute({ean});
    if (resolveRequestIdRef.current !== requestId) {
      return;
    }

    setResolving(false);
    if ('fallback' in result) {
      openManualWithEanForm(ean);
      return;
    }

    setScannedProduct(result);
    setSheetMode('details');
  };

  const codeScanner = useCodeScanner({
    codeTypes: ['ean-13', 'ean-8', 'upc-a', 'upc-e', 'code-128'],
    onCodeScanned: codes => {
      const firstCode = codes[0]?.value?.trim().replace(/\s/g, '') ?? '';
      if (!firstCode) {
        return;
      }

      if (!isValidEAN(firstCode)) {
        return;
      }
      if (resolving || adding || sheetMode !== 'none') {
        return;
      }

      const now = Date.now();
      const lastScan = lastAcceptedScanRef.current;
      if (lastScan && lastScan.code === firstCode && now - lastScan.scannedAt < 2000) {
        return;
      }

      lastAcceptedScanRef.current = {code: firstCode, scannedAt: now};
      resolveScannedProduct(firstCode).catch(() => {
        setResolving(false);
        setScannedProduct(null);
        setSheetMode('none');
        Alert.alert('Błąd', 'Nie udało się odczytać produktu dla zeskanowanego EAN.');
      });
    },
  });

  if (!hasPermission) {
    return (
      <View style={styles.center}>
        {onRequestClose ? (
          <Pressable
            onPress={onRequestClose}
            style={[styles.backOverlay, {top: Math.max(insets.top, 12)}]}
            hitSlop={12}>
            <Text style={styles.backText}>&#8592; Wróć</Text>
          </Pressable>
        ) : null}
        <Text style={styles.title}>Scan Product</Text>
        <Text style={styles.info}>Camera permission denied</Text>
        <Button title="Grant camera permission" onPress={requestPermission} />
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.center}>
        {onRequestClose ? (
          <Pressable
            onPress={onRequestClose}
            style={[styles.backOverlay, {top: Math.max(insets.top, 12)}]}
            hitSlop={12}>
            <Text style={styles.backText}>&#8592; Wróć</Text>
          </Pressable>
        ) : null}
        <Text style={styles.title}>Scan Product</Text>
        <Text style={styles.info}>No camera is available on this device.</Text>
      </View>
    );
  }

  const handleAddProduct = async () => {
    if (!scannedProduct) {
      return;
    }
    setAdding(true);
    try {
      const expiryDate = expirationDate ? formatExpiryForDb(expirationDate) : null;
      for (let i = 0; i < amount; i += 1) {
        await repo.addToInventory(generateInventoryId(i), scannedProduct.ean, null, expiryDate);
      }
      closeBottomSheet();
      onProductAdded?.();
    } catch {
      Alert.alert('Błąd', 'Nie udało się dodać produktu do spiżarni.');
    } finally {
      setAdding(false);
    }
  };

  const handleSaveManualWithEan = async () => {
    const normalizedName = manualName.trim();
    const normalizedEan = manualEan.trim();
    if (!normalizedName) {
      Alert.alert('Brak nazwy', 'Podaj nazwę produktu.');
      return;
    }
    if (!isValidEAN(normalizedEan)) {
      Alert.alert('Nieprawidłowy EAN', 'Nie udało się zapisać produktu bez poprawnego EAN.');
      return;
    }

    setAdding(true);
    try {
      await repo.saveDefinition({
        ean: normalizedEan,
        name: normalizedName,
        brand: manualBrand.trim() || undefined,
        category: manualCategory.trim() || undefined,
      });
      const expiryDate = expirationDate ? formatExpiryForDb(expirationDate) : null;
      for (let i = 0; i < amount; i += 1) {
        await repo.addToInventory(generateInventoryId(i), normalizedEan, null, expiryDate);
      }
      closeBottomSheet();
      onProductAdded?.();
    } catch {
      Alert.alert('Błąd', 'Nie udało się zapisać produktu manualnie.');
    } finally {
      setAdding(false);
    }
  };

  const handleSaveManualNoEan = async () => {
    const normalizedName = manualCustomName.trim();
    if (!normalizedName) {
      Alert.alert('Brak nazwy', 'Podaj nazwę produktu.');
      return;
    }

    setAdding(true);
    try {
      const expiryDate = expirationDate ? formatExpiryForDb(expirationDate) : null;
      for (let i = 0; i < amount; i += 1) {
        await repo.addToInventory(generateInventoryId(i), null, normalizedName, expiryDate);
      }
      closeBottomSheet();
      onProductAdded?.();
    } catch {
      Alert.alert('Błąd', 'Nie udało się dodać produktu bez EAN.');
    } finally {
      setAdding(false);
    }
  };

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        codeScanner={codeScanner}
      />
      <Pressable
        onPress={onRequestClose}
        style={[styles.backOverlay, {top: Math.max(insets.top, 12)}]}
        hitSlop={12}>
        <Text style={styles.backText}>&#8592; Wróć</Text>
      </Pressable>
      <Pressable
        onPress={openManualNoEanForm}
        style={[styles.manualOverlayButton, {top: Math.max(insets.top, 12)}]}
        disabled={resolving || adding}>
        <Text style={styles.manualOverlayButtonText}>Nie mam EAN</Text>
      </Pressable>

      <Animated.View
        style={[
          styles.bottomSheet,
          {
            paddingBottom: Math.max(insets.bottom, 12),
            transform: [{translateY: sheetTranslateY}],
          },
        ]}>
        {resolving ? (
          <View style={styles.resolvingBox}>
            <ActivityIndicator color={colors.success} />
            <Text style={styles.info}>Pobieram dane produktu…</Text>
          </View>
        ) : null}
        {sheetMode === 'details' && scannedProduct ? (
          <View style={styles.sheetContent}>
            <View style={styles.productRow}>
              {scannedProduct.imageUrl ? (
                <Image source={{uri: scannedProduct.imageUrl}} style={styles.productImage} />
              ) : (
                <View style={styles.productImage} />
              )}
              <View style={styles.productMeta}>
                <Text style={styles.productName}>{scannedProduct.name}</Text>
                {scannedProduct.brand ? (
                  <Text style={styles.productProducer}>{scannedProduct.brand}</Text>
                ) : null}
                <Text style={styles.productEan}>EAN: {scannedProduct.ean}</Text>
              </View>
            </View>

            <View style={styles.expirationSection}>
              <Text style={styles.inputLabel}>
                Expiration date: {expirationDate
                  ? formatDate(
                      expirationDate.getDate(),
                      expirationDate.getMonth() + 1,
                      expirationDate.getFullYear(),
                    )
                  : 'not set'}
              </Text>
              <View style={styles.expirationToggleRow}>
                <Pressable
                  style={[
                    styles.expirationToggleButton,
                    expirationDate && styles.expirationToggleButtonActive,
                  ]}
                  onPress={() => setExpirationDate(current => current ?? getDefaultExpirationDate())}>
                  <Text
                    style={[
                      styles.expirationToggleText,
                      expirationDate && styles.expirationToggleTextActive,
                    ]}>
                    Set expiration date
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.expirationToggleButton,
                    !expirationDate && styles.expirationToggleButtonActive,
                  ]}
                  onPress={() => setExpirationDate(null)}>
                  <Text
                    style={[
                      styles.expirationToggleText,
                      !expirationDate && styles.expirationToggleTextActive,
                    ]}>
                    No expiration date
                  </Text>
                </Pressable>
              </View>
              {expirationDate ? (
                <View style={styles.wheelsRow}>
                  <WheelPicker
                    label="Day"
                    values={days}
                    selectedValue={expirationDate.getDate()}
                    onValueChange={value => updateDatePart('day', value)}
                  />
                  <WheelPicker
                    label="Month"
                    values={months}
                    selectedValue={expirationDate.getMonth() + 1}
                    onValueChange={value => updateDatePart('month', value)}
                  />
                  <WheelPicker
                    label="Year"
                    values={years}
                    selectedValue={expirationDate.getFullYear()}
                    onValueChange={value => updateDatePart('year', value)}
                  />
                </View>
              ) : null}
              
              <Text style={styles.inputLabel}>Amount</Text>
              <View style={styles.amountRow}>
                <Pressable
                  style={[styles.amountButtonBase, styles.amountButtonWide]}
                  onPress={() => setAmount(current => Math.max(1, current - 5))}>
                  <Text style={styles.amountButtonText}>-5</Text>
                </Pressable>
                <Pressable
                  style={[styles.amountButtonBase, styles.amountButtonRound]}
                  onPress={() => setAmount(current => Math.max(1, current - 1))}>
                  <Text style={styles.amountButtonText}>-</Text>
                </Pressable>

                <Text style={styles.amountValue}>{amount}</Text>
                <Pressable
                  style={[styles.amountButtonBase, styles.amountButtonRound]}
                  onPress={() => setAmount(current => Math.min(999, current + 1))}>
                  <Text style={styles.amountButtonText}>+</Text>
                </Pressable>
                <Pressable
                  style={[styles.amountButtonBase, styles.amountButtonWide]}
                  onPress={() => setAmount(current => Math.min(999, current + 5))}>
                  <Text style={styles.amountButtonText}>+5</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.actions}>
              <Pressable
                style={[styles.actionButtonBase, styles.secondaryButton]}
                onPress={closeBottomSheet}
                disabled={adding}>
                <Text style={[styles.actionButtonTextBase, styles.secondaryButtonText]}>Close</Text>
              </Pressable>
              <Pressable
                style={[styles.actionButtonBase, styles.primaryButton, adding && styles.buttonDisabled]}
                onPress={() => {
                  handleAddProduct().catch(() => {});
                }}
                disabled={adding || resolving}>
                <Text style={[styles.actionButtonTextBase, styles.primaryButtonText]}>
                  {adding ? 'Dodaję…' : 'Add'}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        {sheetMode === 'manualWithEan' ? (
          <View style={styles.sheetContent}>
            <Text style={styles.productName}>Dodaj produkt ręcznie (EAN)</Text>
            <Text style={styles.inputLabel}>EAN</Text>
            <TextInput
              value={manualEan}
              onChangeText={setManualEan}
              style={styles.textInput}
              editable={false}
              selectTextOnFocus={false}
            />
            <Text style={styles.inputLabel}>Nazwa produktu</Text>
            <TextInput
              value={manualName}
              onChangeText={setManualName}
              style={styles.textInput}
              placeholder="Np. Makaron pełnoziarnisty"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.inputLabel}>Marka (opcjonalnie)</Text>
            <TextInput
              value={manualBrand}
              onChangeText={setManualBrand}
              style={styles.textInput}
              placeholder="Np. Barilla"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.inputLabel}>Kategoria (opcjonalnie)</Text>
            <TextInput
              value={manualCategory}
              onChangeText={setManualCategory}
              style={styles.textInput}
              placeholder="Np. Dry Goods"
              placeholderTextColor={colors.textMuted}
            />
            <View style={styles.expirationSection}>
              <Text style={styles.inputLabel}>
                Expiration date: {expirationDate
                  ? formatDate(
                      expirationDate.getDate(),
                      expirationDate.getMonth() + 1,
                      expirationDate.getFullYear(),
                    )
                  : 'not set'}
              </Text>
              <View style={styles.expirationToggleRow}>
                <Pressable
                  style={[
                    styles.expirationToggleButton,
                    expirationDate && styles.expirationToggleButtonActive,
                  ]}
                  onPress={() => setExpirationDate(current => current ?? getDefaultExpirationDate())}>
                  <Text
                    style={[
                      styles.expirationToggleText,
                      expirationDate && styles.expirationToggleTextActive,
                    ]}>
                    Set expiration date
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.expirationToggleButton,
                    !expirationDate && styles.expirationToggleButtonActive,
                  ]}
                  onPress={() => setExpirationDate(null)}>
                  <Text
                    style={[
                      styles.expirationToggleText,
                      !expirationDate && styles.expirationToggleTextActive,
                    ]}>
                    No expiration date
                  </Text>
                </Pressable>
              </View>
              {expirationDate ? (
                <View style={styles.wheelsRow}>
                  <WheelPicker
                    label="Day"
                    values={days}
                    selectedValue={expirationDate.getDate()}
                    onValueChange={value => updateDatePart('day', value)}
                  />
                  <WheelPicker
                    label="Month"
                    values={months}
                    selectedValue={expirationDate.getMonth() + 1}
                    onValueChange={value => updateDatePart('month', value)}
                  />
                  <WheelPicker
                    label="Year"
                    values={years}
                    selectedValue={expirationDate.getFullYear()}
                    onValueChange={value => updateDatePart('year', value)}
                  />
                </View>
              ) : null}

              <Text style={styles.inputLabel}>Amount</Text>
              <View style={styles.amountRow}>
                <Pressable
                  style={[styles.amountButtonBase, styles.amountButtonWide]}
                  onPress={() => setAmount(current => Math.max(1, current - 5))}>
                  <Text style={styles.amountButtonText}>-5</Text>
                </Pressable>
                <Pressable
                  style={[styles.amountButtonBase, styles.amountButtonRound]}
                  onPress={() => setAmount(current => Math.max(1, current - 1))}>
                  <Text style={styles.amountButtonText}>-</Text>
                </Pressable>
                <Text style={styles.amountValue}>{amount}</Text>
                <Pressable
                  style={[styles.amountButtonBase, styles.amountButtonRound]}
                  onPress={() => setAmount(current => Math.min(999, current + 1))}>
                  <Text style={styles.amountButtonText}>+</Text>
                </Pressable>
                <Pressable
                  style={[styles.amountButtonBase, styles.amountButtonWide]}
                  onPress={() => setAmount(current => Math.min(999, current + 5))}>
                  <Text style={styles.amountButtonText}>+5</Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.actions}>
              <Pressable
                style={[styles.actionButtonBase, styles.secondaryButton]}
                onPress={closeBottomSheet}
                disabled={adding}>
                <Text style={[styles.actionButtonTextBase, styles.secondaryButtonText]}>Close</Text>
              </Pressable>
              <Pressable
                style={[styles.actionButtonBase, styles.primaryButton, adding && styles.buttonDisabled]}
                onPress={() => {
                  handleSaveManualWithEan().catch(() => {});
                }}
                disabled={adding || resolving}>
                <Text style={[styles.actionButtonTextBase, styles.primaryButtonText]}>
                  {adding ? 'Zapisuję…' : 'Zapisz i dodaj'}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        {sheetMode === 'manualNoEan' ? (
          <View style={styles.sheetContent}>
            <Text style={styles.productName}>Dodaj produkt ręcznie (bez EAN)</Text>
            <Text style={styles.inputLabel}>Nazwa produktu</Text>
            <TextInput
              value={manualCustomName}
              onChangeText={setManualCustomName}
              style={styles.textInput}
              placeholder="Np. Domowy zakwas"
              placeholderTextColor={colors.textMuted}
            />
            <View style={styles.expirationSection}>
              <Text style={styles.inputLabel}>
                Expiration date: {expirationDate
                  ? formatDate(
                      expirationDate.getDate(),
                      expirationDate.getMonth() + 1,
                      expirationDate.getFullYear(),
                    )
                  : 'not set'}
              </Text>
              <View style={styles.expirationToggleRow}>
                <Pressable
                  style={[
                    styles.expirationToggleButton,
                    expirationDate && styles.expirationToggleButtonActive,
                  ]}
                  onPress={() => setExpirationDate(current => current ?? getDefaultExpirationDate())}>
                  <Text
                    style={[
                      styles.expirationToggleText,
                      expirationDate && styles.expirationToggleTextActive,
                    ]}>
                    Set expiration date
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.expirationToggleButton,
                    !expirationDate && styles.expirationToggleButtonActive,
                  ]}
                  onPress={() => setExpirationDate(null)}>
                  <Text
                    style={[
                      styles.expirationToggleText,
                      !expirationDate && styles.expirationToggleTextActive,
                    ]}>
                    No expiration date
                  </Text>
                </Pressable>
              </View>
              {expirationDate ? (
                <View style={styles.wheelsRow}>
                  <WheelPicker
                    label="Day"
                    values={days}
                    selectedValue={expirationDate.getDate()}
                    onValueChange={value => updateDatePart('day', value)}
                  />
                  <WheelPicker
                    label="Month"
                    values={months}
                    selectedValue={expirationDate.getMonth() + 1}
                    onValueChange={value => updateDatePart('month', value)}
                  />
                  <WheelPicker
                    label="Year"
                    values={years}
                    selectedValue={expirationDate.getFullYear()}
                    onValueChange={value => updateDatePart('year', value)}
                  />
                </View>
              ) : null}
              <Text style={styles.inputLabel}>Amount</Text>
              <View style={styles.amountRow}>
                <Pressable
                  style={[styles.amountButtonBase, styles.amountButtonWide]}
                  onPress={() => setAmount(current => Math.max(1, current - 5))}>
                  <Text style={styles.amountButtonText}>-5</Text>
                </Pressable>
                <Pressable
                  style={[styles.amountButtonBase, styles.amountButtonRound]}
                  onPress={() => setAmount(current => Math.max(1, current - 1))}>
                  <Text style={styles.amountButtonText}>-</Text>
                </Pressable>
                <Text style={styles.amountValue}>{amount}</Text>
                <Pressable
                  style={[styles.amountButtonBase, styles.amountButtonRound]}
                  onPress={() => setAmount(current => Math.min(999, current + 1))}>
                  <Text style={styles.amountButtonText}>+</Text>
                </Pressable>
                <Pressable
                  style={[styles.amountButtonBase, styles.amountButtonWide]}
                  onPress={() => setAmount(current => Math.min(999, current + 5))}>
                  <Text style={styles.amountButtonText}>+5</Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.actions}>
              <Pressable
                style={[styles.actionButtonBase, styles.secondaryButton]}
                onPress={closeBottomSheet}
                disabled={adding}>
                <Text style={[styles.actionButtonTextBase, styles.secondaryButtonText]}>Close</Text>
              </Pressable>
              <Pressable
                style={[styles.actionButtonBase, styles.primaryButton, adding && styles.buttonDisabled]}
                onPress={() => {
                  handleSaveManualNoEan().catch(() => {});
                }}
                disabled={adding || resolving}>
                <Text style={[styles.actionButtonTextBase, styles.primaryButtonText]}>
                  {adding ? 'Dodaję…' : 'Dodaj'}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

export default function ProductScannerView({onRequestClose, onProductAdded}: ProductScannerViewProps) {
  if (!visionCamera) {
    return <ScannerUnavailable onRequestClose={onRequestClose} />;
  }

  const {Camera, useCameraPermission, useCameraDevice, useCodeScanner} = visionCamera as Record<
    string,
    unknown
  >;

  if (
    typeof Camera !== 'function' ||
    typeof useCodeScanner !== 'function' ||
    typeof useCameraPermission !== 'function' ||
    typeof useCameraDevice !== 'function'
  ) {
    return <ScannerUnavailable onRequestClose={onRequestClose} />;
  }

  const visionModule: VisionCameraModule = {
    Camera: Camera as VisionCameraModule['Camera'],
    useCameraPermission: useCameraPermission as VisionCameraModule['useCameraPermission'],
    useCameraDevice: useCameraDevice as VisionCameraModule['useCameraDevice'],
    useCodeScanner: useCodeScanner as VisionCameraModule['useCodeScanner'],
  };

  return (
    <ProductScannerVisionContent
      onRequestClose={onRequestClose}
      onProductAdded={onProductAdded}
      visionModule={visionModule}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.black,
  },
  center: {
    flex: 1,
    backgroundColor: '#111',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 10,
  },
  backOverlay: {
    position: 'absolute',
    left: 16,
    zIndex: 20,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  backText: {
    color: colors.successAccent,
    fontSize: 16,
    fontWeight: '700',
  },
  manualOverlayButton: {
    position: 'absolute',
    right: 16,
    zIndex: 20,
    backgroundColor: colors.surfaceDark,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.borderDark,
  },
  manualOverlayButtonText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  topOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
  },
  header: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 6,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  info: {
    color: '#ddd',
    textAlign: 'center',
  },
  overlayInfo: {
    color: colors.infoText,
    fontSize: 13,
    marginBottom: 2,
  },
  scanValue: {
    color: colors.successAccent,
    fontWeight: '700',
  },
  bottomSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: BOTTOM_SHEET_HEIGHT,
    backgroundColor: colors.surfaceDark,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 14,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: -3},
    elevation: 10,
  },
  sheetContent: {
    gap: 14,
  },
  resolvingBox: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  productRow: {
    flexDirection: 'row',
    gap: 12,
  },
  productImage: {
    width: 84,
    height: 84,
    borderRadius: 10,
    backgroundColor: '#2a2e37',
  },
  productMeta: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  productName: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  productProducer: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  productEan: {
    color: colors.successAccent,
    fontSize: 13,
    fontWeight: '600',
  },
  expirationSection: {
    gap: 8,
  },
  inputLabel: {
    color: '#eef1f7',
    fontWeight: '600',
  },
  textInput: {
    backgroundColor: colors.surfaceMid,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.borderDark,
  },
  wheelsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  expirationToggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  expirationToggleButton: {
    flex: 1,
    height: 36,
    borderRadius: 9,
    backgroundColor: colors.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expirationToggleButtonActive: {
    backgroundColor: colors.success,
  },
  expirationToggleText: {
    color: '#c9ced8',
    fontWeight: '600',
  },
  expirationToggleTextActive: {
    color: colors.successText,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  amountButtonBase: {
    height: 42,
    backgroundColor: colors.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountButtonRound: {
    width: 42,
    borderRadius: 21,
  },
  amountButtonWide: {
    width: 55,
    borderRadius: 21,
  },
  amountButtonText: {
    color: colors.textPrimary,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '700',
  },
  amountValue: {
    minWidth: 52,
    textAlign: 'center',
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButtonBase: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonTextBase: {
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: colors.surfaceSoft,
  },
  secondaryButtonText: {
    color: '#e5e7eb',
  },
  primaryButton: {
    backgroundColor: colors.success,
  },
  primaryButtonText: {
    color: colors.successText,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
