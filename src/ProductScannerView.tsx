import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  Alert,
  Animated,
  Button,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import WheelPicker from './components/WheelPicker';
import {colors} from './theme/colors';

const visionCamera = (() => {
  try {
    // Runtime require keeps Jest/tests working when native module is missing.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('react-native-vision-camera');
  } catch {
    return null;
  }
})();

type MockProduct = {
  ean: string;
  name: string;
  producer: string;
  imageUrl: string;
};

const MOCK_PRODUCTS: MockProduct[] = [
  {
    ean: '5901234123457',
    name: 'Natural Yogurt 400g',
    producer: 'Fresh Valley',
    imageUrl:
      'https://images.unsplash.com/photo-1571212515416-fef01fc43637?auto=format&fit=crop&w=640&q=80',
  },
  {
    ean: '5902345234568',
    name: 'Sourdough Bread',
    producer: 'Golden Bakery',
    imageUrl:
      'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=640&q=80',
  },
  {
    ean: '5903456345679',
    name: 'Smoked Chicken Breast',
    producer: 'Farm Kitchen',
    imageUrl:
      'https://images.unsplash.com/photo-1603048297172-c92544798d5a?auto=format&fit=crop&w=640&q=80',
  },
];

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

function getMockProductByEAN(ean: string): MockProduct {
  const exactMatch = MOCK_PRODUCTS.find(product => product.ean === ean);
  if (exactMatch) {
    return exactMatch;
  }

  const fallback = MOCK_PRODUCTS[Number(ean[ean.length - 1]) % MOCK_PRODUCTS.length];
  return {...fallback, ean};
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
  onRequestClose?: () => void;
};

export default function ProductScannerView({onRequestClose}: ProductScannerViewProps) {
  if (!visionCamera) {
    return <ScannerUnavailable onRequestClose={onRequestClose} />;
  }

  const Camera = visionCamera.Camera as React.ComponentType<any>;
  const useCameraPermission = visionCamera.useCameraPermission as () => {
    hasPermission: boolean;
    requestPermission: () => Promise<boolean>;
  };
  const useCameraDevice = visionCamera.useCameraDevice as (
    cameraPosition: 'front' | 'back',
  ) => any;
  const useCodeScanner = visionCamera.useCodeScanner as ((args: {
    codeTypes: string[];
    onCodeScanned: (codes: Array<{value?: string}>) => void;
  }) => any) | null;

  if (!useCodeScanner || !useCameraPermission || !useCameraDevice) {
    return <ScannerUnavailable onRequestClose={onRequestClose} />;
  }

  const insets = useSafeAreaInsets();
  const {hasPermission, requestPermission} = useCameraPermission();
  const device = useCameraDevice('back');
  const [lastCode, setLastCode] = useState('No scans yet');
  const [scannedProduct, setScannedProduct] = useState<MockProduct | null>(null);
  const [expirationDate, setExpirationDate] = useState<Date | null>(getDefaultExpirationDate);
  const [amount, setAmount] = useState(1);
  const sheetTranslateY = useRef(new Animated.Value(BOTTOM_SHEET_HEIGHT)).current;
  const lastAcceptedScanRef = useRef<{code: string; scannedAt: number} | null>(null);
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
      toValue: scannedProduct ? 0 : BOTTOM_SHEET_HEIGHT,
      duration: 250,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [scannedProduct, sheetTranslateY]);

  const codeScanner = useCodeScanner({
    codeTypes: ['ean-13', 'ean-8', 'upc-a', 'upc-e', 'code-128'],
    onCodeScanned: codes => {
      const firstCode = codes[0]?.value?.trim().replace(/\s/g, '') ?? '';
      if (!firstCode) {
        return;
      }

      setLastCode(firstCode);

      if (!isValidEAN(firstCode)) {
        return;
      }

      const now = Date.now();
      const lastScan = lastAcceptedScanRef.current;
      if (lastScan && lastScan.code === firstCode && now - lastScan.scannedAt < 2000) {
        return;
      }

      lastAcceptedScanRef.current = {code: firstCode, scannedAt: now};
      setScannedProduct(getMockProductByEAN(firstCode));
      setExpirationDate(getDefaultExpirationDate());
      setAmount(1);
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

  const handleAddProduct = () => {
    if (!scannedProduct) {
      return;
    }
    setScannedProduct(null);

    Alert.alert(
      'Product added (mock)',
      `${scannedProduct.name}\nEAN: ${scannedProduct.ean}\nExpiration: ${
        expirationDate
          ? formatDate(
              expirationDate.getDate(),
              expirationDate.getMonth() + 1,
              expirationDate.getFullYear(),
            )
          : 'No expiration date'
      }\nAmount: ${amount}`,
    );
  };

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        codeScanner={codeScanner}
      />
      {onRequestClose ? (
        <Pressable
          onPress={onRequestClose}
          style={[styles.backOverlay, {top: Math.max(insets.top, 12)}]}
          hitSlop={12}>
          <Text style={styles.backText}>&#8592; Wróć</Text>
        </Pressable>
      ) : null}

      <Animated.View
        style={[
          styles.bottomSheet,
          {
            paddingBottom: Math.max(insets.bottom, 12),
            transform: [{translateY: sheetTranslateY}],
          },
        ]}>
        {scannedProduct ? (
          <View style={styles.sheetContent}>
            <View style={styles.productRow}>
              <Image source={{uri: scannedProduct.imageUrl}} style={styles.productImage} />
              <View style={styles.productMeta}>
                <Text style={styles.productName}>{scannedProduct.name}</Text>
                <Text style={styles.productProducer}>{scannedProduct.producer}</Text>
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
                onPress={() => setScannedProduct(null)}>
                <Text style={[styles.actionButtonTextBase, styles.secondaryButtonText]}>Close</Text>
              </Pressable>
              <Pressable style={[styles.actionButtonBase, styles.primaryButton]} onPress={handleAddProduct}>
                <Text style={[styles.actionButtonTextBase, styles.primaryButtonText]}>Add</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </Animated.View>
    </View>
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
});
