import React, {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Button,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import WheelPicker from './components/WheelPicker';
import {ProductPhotoActions} from './components/ProductPhotoActions';
import {useProductPhotoPreview} from './components/ProductPhotoPreview';
import {CatalogProduct, ProductDefinition} from './domain/types';
import {normalizeProductName} from './infrastructure/ProductRepository';
import {getProductRepository, getScanToAdd} from './app/services';
import {colors} from './theme/colors';
import {shadowGutters, shadowInsets, shadows} from './theme/shadows';
import {DraggableBottomSheet} from './shopping-lists/modals/DraggableBottomSheet';
import {AppToast, useAppToast} from './components/AppToast';
import ProductCatalogView from './ProductCatalogView';
import {ProductPhotoDraft, type ProductPhotoSource} from './infrastructure/productPhotos';

const MANUAL_HEADER_LINE_HEIGHT = 22;
const MANUAL_HEADER_LINES = 2;

const visionCamera = (() => {
  try {
    // Runtime require keeps Jest/tests working when native module is missing.
    return require('react-native-vision-camera');
  } catch {
    return null;
  }
})();

function getDefaultExpirationDate() {
  const date = new Date();
  date.setDate(date.getDate() + 2);
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

function formatAddSuccessMessage(name: string, amount: number) {
  if (amount <= 1) {
    return `Dodano produkt: ${name}`;
  }
  return `Dodano ${amount} szt.: ${name}`;
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
      <Text style={styles.title}>Skaner niedostępny</Text>
      <Text style={styles.info}>Brakuje biblioteki skanera albo zgody na użycie aparatu.</Text>
    </View>
  );
}

type ProductScannerViewProps = {
  onRequestClose?: () => void;
  onProductAdded?: () => void;
  onCatalogProductUpdated?: () => void;
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

async function persistWithManualPhoto<T extends {imageUrl?: string | null}>(
  draft: ProductPhotoDraft,
  photoUri: string | null,
  persist: () => Promise<T>,
): Promise<T> {
  let result: T | undefined;
  await draft.save(async () => {
    result = await persist();
    return photoUri != null && result.imageUrl === photoUri;
  });
  if (!result) {
    throw new Error('Manual photo draft is no longer available');
  }
  return result;
}

const SheetFormScrollContext = createContext<{
  lockParentScroll: (locked: boolean) => void;
} | null>(null);

function SheetScrollableForm({
  children,
  maxHeight,
  keyboardVerticalOffset = 0,
  contentBottomInset = 8,
}: {
  children: React.ReactNode;
  maxHeight: number;
  keyboardVerticalOffset?: number;
  contentBottomInset?: number;
}) {
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const wheelLockCountRef = useRef(0);
  const lockParentScroll = useCallback((locked: boolean) => {
    if (locked) {
      wheelLockCountRef.current += 1;
    } else {
      wheelLockCountRef.current = Math.max(0, wheelLockCountRef.current - 1);
    }
    setScrollEnabled(wheelLockCountRef.current === 0);
  }, []);

  return (
    <SheetFormScrollContext.Provider value={{lockParentScroll}}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.sheetKeyboardAvoid, {maxHeight}]}
        keyboardVerticalOffset={keyboardVerticalOffset}>
        <ScrollView
          style={styles.sheetScroll}
          contentContainerStyle={[
            styles.sheetScrollContent,
            {paddingBottom: Math.max(contentBottomInset, shadowInsets.card.bottom)},
          ]}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          scrollEnabled={scrollEnabled}
          showsVerticalScrollIndicator
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SheetFormScrollContext.Provider>
  );
}

type ManualFormFooterProps = {
  expirationDate: Date | null;
  days: number[];
  months: number[];
  years: number[];
  updateDatePart: (part: 'day' | 'month' | 'year', value: number) => void;
  amount: number;
  setAmount: React.Dispatch<React.SetStateAction<number>>;
  adding: boolean;
  resolving: boolean;
  onClose: () => void;
  onSave: () => void;
  saveLabel: string;
  savingLabel: string;
};

function ManualFormFooter({
  expirationDate,
  days,
  months,
  years,
  updateDatePart,
  amount,
  setAmount,
  adding,
  resolving,
  onClose,
  onSave,
  saveLabel,
  savingLabel,
}: ManualFormFooterProps) {
  const sheetScroll = useContext(SheetFormScrollContext);
  const lockParentScroll = sheetScroll?.lockParentScroll;
  const wheelInteraction = useMemo(
    () => ({
      onInteractionStart: () => lockParentScroll?.(true),
      onInteractionEnd: () => lockParentScroll?.(false),
    }),
    [lockParentScroll],
  );

  return (
    <>
      {expirationDate ? (
        <View style={styles.wheelsRow}>
          <WheelPicker
            label="Dzień"
            values={days}
            selectedValue={expirationDate.getDate()}
            onValueChange={value => updateDatePart('day', value)}
            onInteractionStart={wheelInteraction.onInteractionStart}
            onInteractionEnd={wheelInteraction.onInteractionEnd}
          />
          <WheelPicker
            label="Miesiąc"
            values={months}
            selectedValue={expirationDate.getMonth() + 1}
            onValueChange={value => updateDatePart('month', value)}
            onInteractionStart={wheelInteraction.onInteractionStart}
            onInteractionEnd={wheelInteraction.onInteractionEnd}
          />
          <WheelPicker
            label="Rok"
            values={years}
            selectedValue={expirationDate.getFullYear()}
            onValueChange={value => updateDatePart('year', value)}
            onInteractionStart={wheelInteraction.onInteractionStart}
            onInteractionEnd={wheelInteraction.onInteractionEnd}
          />
        </View>
      ) : null}
      <Text style={styles.inputLabel}>Ilość</Text>
      <QuantityStepper
        value={amount}
        busy={adding || resolving}
        onDecrease={() => setAmount(current => Math.max(1, current - 1))}
        onIncrease={() => setAmount(current => Math.min(999, current + 1))}
      />
      <View style={styles.actions}>
        <Pressable
          style={[styles.actionButtonBase, styles.secondaryButton]}
          onPress={onClose}
          disabled={adding}>
          <Text style={[styles.actionButtonTextBase, styles.secondaryButtonText]}>Zamknij</Text>
        </Pressable>
        <Pressable
          style={[styles.actionButtonBase, styles.primaryButton, adding && styles.buttonDisabled]}
          onPress={onSave}
          disabled={adding || resolving}>
          <Text style={[styles.actionButtonTextBase, styles.primaryButtonText]}>
            {adding ? savingLabel : saveLabel}
          </Text>
        </Pressable>
      </View>
    </>
  );
}

function QuantityStepper({
  value,
  busy,
  onDecrease,
  onIncrease,
}: {
  value: number;
  busy: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  const canDecrease = value > 1 && !busy;
  const canIncrease = value < 999 && !busy;

  return (
    <View style={styles.quantityStepper}>
      <Pressable
        disabled={!canDecrease}
        onPress={onDecrease}
        style={({pressed}) => [
          styles.stepButton,
          !canDecrease && styles.buttonDisabled,
          pressed && styles.pressed,
        ]}>
        <Text style={styles.stepText}>−</Text>
      </Pressable>
      <Text style={styles.quantityText}>{value}</Text>
      <Pressable
        disabled={!canIncrease}
        onPress={onIncrease}
        style={({pressed}) => [
          styles.stepButton,
          !canIncrease && styles.buttonDisabled,
          pressed && styles.pressed,
        ]}>
        <Text style={styles.stepText}>+</Text>
      </Pressable>
    </View>
  );
}

type ProductPhotoPickerProps = {
  imageUri: string | null;
  disabled: boolean;
  picking: boolean;
  onTakePhoto: () => void;
  onPickFromLibrary: () => void;
  onClear: () => void;
  onPreview: () => void;
};

function ProductPhotoPicker({
  imageUri,
  disabled,
  picking,
  onTakePhoto,
  onPickFromLibrary,
  onClear,
  onPreview,
}: ProductPhotoPickerProps) {
  return (
    <View style={styles.photoSection}>
      <Text style={styles.inputLabel}>Zdjęcie produktu (opcjonalnie)</Text>
      <View style={styles.photoRow}>
        {imageUri ? (
          <Pressable testID="manual-photo-preview" accessibilityRole="button" accessibilityLabel="Powiększ zdjęcie produktu" onPress={onPreview}>
            <Image source={{uri: imageUri}} style={styles.manualPhotoPreview} />
          </Pressable>
        ) : (
          <View style={styles.manualPhotoPlaceholder}>
            <Text style={styles.manualPhotoPlaceholderText}>Brak zdjęcia</Text>
          </View>
        )}
        <View style={styles.photoActions}>
          <ProductPhotoActions
            hasPhoto={Boolean(imageUri)}
            disabled={disabled}
            picking={picking}
            onTakePhoto={onTakePhoto}
            onPickFromLibrary={onPickFromLibrary}
            onClear={onClear}
          />
        </View>
      </View>
    </View>
  );
}

function ProductScannerVisionContent({
  onRequestClose,
  onProductAdded,
  visionModule,
}: {
  onRequestClose?: () => void;
  onProductAdded?: () => void;
  visionModule: VisionCameraModule;
}) {
  const {Camera, useCameraPermission, useCameraDevice, useCodeScanner} = visionModule;
  const insets = useSafeAreaInsets();
  const {height: windowHeight, fontScale} = useWindowDimensions();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const keyboardInset = Math.max(0, keyboardHeight - insets.bottom);
  const sheetContentBottomInset = keyboardInset > 0 ? keyboardInset + 24 : 8;
  const sheetFormMaxHeight = useMemo(() => {
    return Math.round(Math.max(260, windowHeight * 0.88));
  }, [windowHeight]);
  const sheetKeyboardOffset = Math.max(insets.top, 12);
  const {hasPermission, requestPermission} = useCameraPermission();
  const device = useCameraDevice('back');
  const [scannedProduct, setScannedProduct] = useState<ProductDefinition | null>(null);
  const [sheetMode, setSheetMode] = useState<SheetMode>('none');
  const [manualEan, setManualEan] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualBrand, setManualBrand] = useState('');
  const [manualCategory, setManualCategory] = useState('');
  const [manualPhotoUri, setManualPhotoUri] = useState<string | null>(null);
  const manualPhotoDraft = useRef<ProductPhotoDraft | null>(null);
  const [expirationDate, setExpirationDate] = useState<Date | null>(null);
  const [amount, setAmount] = useState(1);
  const [resolving, setResolving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [photoPicking, setPhotoPicking] = useState(false);
  const [manualLookup, setManualLookup] = useState<{
    ean: string;
    status: 'loading' | 'ready' | 'error';
    product: ProductDefinition | null;
  } | null>(null);
  const [manualLookupAttempt, setManualLookupAttempt] = useState(0);
  const manualLookupRequestRef = useRef(0);
  const [manualNameLookup, setManualNameLookup] = useState<{
    name: string;
    status: 'loading' | 'ready' | 'error';
    product: CatalogProduct | null;
  } | null>(null);
  const [manualNameLookupAttempt, setManualNameLookupAttempt] = useState(0);
  const manualNameLookupRequestRef = useRef(0);
  const addingRef = useRef(false);
  const lastAcceptedScanRef = useRef<{code: string; scannedAt: number} | null>(null);
  const resolveRequestIdRef = useRef(0);
  const scanToAdd = useMemo(() => getScanToAdd(), []);
  const repo = useMemo(() => getProductRepository(), []);
  const manualFormOpen = sheetMode === 'manualNoEan' || sheetMode === 'manualWithEan';
  const normalizedManualEan = manualEan.trim();
  const shouldLookupManualEan = manualFormOpen && isValidEAN(normalizedManualEan);
  const currentManualLookup = manualLookup?.ean === normalizedManualEan ? manualLookup : null;
  const manualLookupPending = shouldLookupManualEan && (!currentManualLookup || currentManualLookup.status === 'loading');
  const manualLookupFailed = shouldLookupManualEan && currentManualLookup?.status === 'error';
  const existingEanProduct = shouldLookupManualEan && currentManualLookup?.status === 'ready'
    ? currentManualLookup.product : null;
  const normalizedManualName = normalizeProductName(manualName);
  const shouldLookupManualName = manualFormOpen && !normalizedManualEan && !!normalizedManualName;
  const currentManualNameLookup = manualNameLookup?.name === normalizedManualName ? manualNameLookup : null;
  const manualNameLookupPending = shouldLookupManualName && (!currentManualNameLookup || currentManualNameLookup.status === 'loading');
  const manualNameLookupFailed = shouldLookupManualName && currentManualNameLookup?.status === 'error';
  const existingGenericProduct = shouldLookupManualName && currentManualNameLookup?.status === 'ready'
    ? currentManualNameLookup.product : null;
  const existingManualProduct = existingEanProduct ?? existingGenericProduct;
  const manualLookupBlocked = manualLookupPending || manualLookupFailed || manualNameLookupPending || manualNameLookupFailed;
  const manualNameLocked = adding || resolving || photoPicking || manualLookupPending || manualLookupFailed || !!existingEanProduct;
  const manualSharedFieldsLocked = adding || resolving || photoPicking || manualLookupBlocked || !!existingManualProduct;
  const photoPreview = useProductPhotoPreview({
    uri: sheetMode === 'details' ? scannedProduct?.imageUrl : existingManualProduct ? existingManualProduct.imageUrl : manualPhotoUri,
    name: sheetMode === 'details' ? scannedProduct?.name ?? '' : existingManualProduct?.name ?? manualName,
    ownerKey: sheetMode === 'none' ? null : `${sheetMode}:${sheetMode === 'details' ? scannedProduct?.ean : normalizedManualEan || normalizedManualName}`,
  });
  const {toast, toastAnim, showToast} = useAppToast();
  const toastTop = useMemo(() => insets.top + 12, [insets.top]);
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

  useEffect(() => {
    if (!manualFormOpen) {
      return;
    }
    const draft = new ProductPhotoDraft();
    manualPhotoDraft.current = draft;
    return () => {
      if (manualPhotoDraft.current === draft) {
        manualPhotoDraft.current = null;
      }
      draft.dispose().catch(error => { console.warn('[ShelfChef] Photo draft cleanup failed', error); });
    };
  }, [manualFormOpen]);

  useEffect(() => {
    const requestId = ++manualLookupRequestRef.current;
    if (!shouldLookupManualEan) {
      setManualLookup(null);
      return;
    }
    let active = true;
    setManualLookup({ean: normalizedManualEan, status: 'loading', product: null});
    repo.findDefinitionByEan(normalizedManualEan).then(product => {
      if (active && requestId === manualLookupRequestRef.current) {
        setManualLookup({ean: normalizedManualEan, status: 'ready', product});
      }
    }).catch(() => {
      if (active && requestId === manualLookupRequestRef.current) {
        setManualLookup({ean: normalizedManualEan, status: 'error', product: null});
      }
    });
    return () => { active = false; };
  }, [repo, shouldLookupManualEan, normalizedManualEan, manualLookupAttempt]);

  useEffect(() => {
    const requestId = ++manualNameLookupRequestRef.current;
    if (!shouldLookupManualName) {
      setManualNameLookup(null);
      return;
    }
    let active = true;
    setManualNameLookup({name: normalizedManualName, status: 'loading', product: null});
    repo.findCatalogProductByNormalizedName('generic', normalizedManualName).then(product => {
      if (active && requestId === manualNameLookupRequestRef.current) {
        setManualNameLookup({name: normalizedManualName, status: 'ready', product});
      }
    }).catch(() => {
      if (active && requestId === manualNameLookupRequestRef.current) {
        setManualNameLookup({name: normalizedManualName, status: 'error', product: null});
      }
    });
    return () => { active = false; };
  }, [repo, shouldLookupManualName, normalizedManualName, manualNameLookupAttempt]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, event => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const resetCommonFormState = () => {
    setExpirationDate(null);
    setManualPhotoUri(null);
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
    setManualEan('');
    setManualName('');
    setManualBrand('');
    setManualCategory('');
    setSheetMode('manualNoEan');
  };

  const closeBottomSheet = () => {
    if (addingRef.current || photoPicking) {
      return;
    }
    manualLookupRequestRef.current += 1;
    manualNameLookupRequestRef.current += 1;
    setManualLookupAttempt(attempt => attempt + 1);
    setManualNameLookupAttempt(attempt => attempt + 1);
    setManualLookup(null);
    setManualNameLookup(null);
    setSheetMode('none');
    setScannedProduct(null);
  };

  const changeManualEan = (value: string) => {
    if (value.trim() !== normalizedManualEan) {
      manualLookupRequestRef.current += 1;
      manualNameLookupRequestRef.current += 1;
      setManualLookupAttempt(attempt => attempt + 1);
      setManualNameLookupAttempt(attempt => attempt + 1);
      setManualLookup(null);
      setManualNameLookup(null);
    }
    setManualEan(value);
  };

  const changeManualName = (value: string) => {
    if (normalizeProductName(value) !== normalizedManualName) {
      manualNameLookupRequestRef.current += 1;
      setManualNameLookupAttempt(attempt => attempt + 1);
      setManualNameLookup(null);
    }
    setManualName(value);
  };

  const pickProductPhoto = async (source: ProductPhotoSource) => {
    const draft = manualPhotoDraft.current;
    if (!draft || photoPicking) {
      return;
    }
    setPhotoPicking(true);
    try {
      const storedUri = await draft.select(source);
      if (storedUri && manualPhotoDraft.current === draft) {
        setManualPhotoUri(storedUri);
      }
    } catch (error) {
      if (manualPhotoDraft.current === draft) {
        showToast(error instanceof Error ? error.message : 'Nie udało się dodać zdjęcia', 'error');
      }
    } finally {
      if (manualPhotoDraft.current === draft) {
        setPhotoPicking(false);
      }
    }
  };

  const clearManualPhoto = () => {
    manualPhotoDraft.current?.clear().catch(error => { console.warn('[ShelfChef] Photo draft cleanup failed', error); });
    setManualPhotoUri(null);
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
        showToast('Nie udało się odczytać produktu', 'error');
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
        <Text style={styles.title}>Skanuj produkt</Text>
        <Text style={styles.info}>Brak zgody na użycie aparatu.</Text>
        <Button title="Przyznaj dostęp do aparatu" onPress={requestPermission} />
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
        <Text style={styles.title}>Skanuj produkt</Text>
        <Text style={styles.info}>Na tym urządzeniu nie znaleziono aparatu.</Text>
      </View>
    );
  }

  const handleAddProduct = async () => {
    if (!scannedProduct || addingRef.current) {
      return;
    }
    addingRef.current = true;
    setAdding(true);
    try {
      const expiryDate = expirationDate ? formatExpiryForDb(expirationDate) : null;
      for (let i = 0; i < amount; i += 1) {
        await repo.addToInventory(generateInventoryId(i), scannedProduct.ean, null, expiryDate);
      }
      addingRef.current = false;
      closeBottomSheet();
      onProductAdded?.();
      showToast(formatAddSuccessMessage(scannedProduct.name, amount));
    } catch {
      showToast('Nie udało się dodać produktu', 'error');
    } finally {
      addingRef.current = false;
      setAdding(false);
    }
  };

  const handleSaveManualProduct = async () => {
    if (addingRef.current || resolving || photoPicking || manualLookupBlocked) {
      return;
    }
    const photoDraft = manualPhotoDraft.current;
    if (!photoDraft) {
      return;
    }
    const normalizedName = (existingManualProduct?.name ?? manualName).trim();
    const normalizedEan = normalizedManualEan;
    if (!normalizedName) {
      showToast('Podaj nazwę produktu', 'error');
      return;
    }
    if (sheetMode === 'manualWithEan' && !isValidEAN(normalizedEan)) {
      showToast('Nie udało się zapisać bez poprawnego EAN', 'error');
      return;
    }
    if (normalizedEan && !isValidEAN(normalizedEan)) {
      showToast('Popraw EAN albo zostaw to pole puste', 'error');
      return;
    }

    addingRef.current = true;
    setAdding(true);
    try {
      const expiryDate = expirationDate ? formatExpiryForDb(expirationDate) : null;
      let savedName = normalizedName;
      if (normalizedEan) {
        let definition = await repo.findDefinitionByEan(normalizedEan);
        if (!definition) {
          const input = {
            ean: normalizedEan,
            name: normalizedName,
            brand: manualBrand.trim() || undefined,
            category: manualCategory.trim() || undefined,
            imageUrl: manualPhotoUri ?? undefined,
          };
          await persistWithManualPhoto(photoDraft, manualPhotoUri, async () => {
            await repo.saveDefinition(input);
            return input;
          });
          definition = await repo.findDefinitionByEan(normalizedEan);
        }
        if (!definition) {
          throw new Error('Product definition not found after save');
        }
        savedName = definition.name;
        for (let i = 0; i < amount; i += 1) {
          await repo.addToInventory(generateInventoryId(i), normalizedEan, null, expiryDate);
        }
      } else {
        const catalog = existingGenericProduct
          ? await repo.findCatalogProductById(existingGenericProduct.id)
          : await persistWithManualPhoto(photoDraft, manualPhotoUri, () => repo.saveGenericCatalogProduct({
            name: normalizedName,
            brand: manualBrand.trim() || undefined,
            category: manualCategory.trim() || undefined,
            imageUrl: manualPhotoUri,
          }));
        if (!catalog) {
          throw new Error('Catalog product not found before adding inventory');
        }
        savedName = catalog.name;
        setManualNameLookup({name: normalizedManualName, status: 'ready', product: catalog});
        for (let i = 0; i < amount; i += 1) {
          await repo.addToInventory(generateInventoryId(i), null, catalog.name, expiryDate, catalog.id);
        }
      }
      addingRef.current = false;
      closeBottomSheet();
      onProductAdded?.();
      showToast(formatAddSuccessMessage(savedName, amount));
    } catch {
      showToast('Nie udało się dodać produktu', 'error');
    } finally {
      addingRef.current = false;
      setAdding(false);
    }
  };

  const manualLookupError = manualLookupFailed ? (
    <View>
      <Text style={styles.info}>Nie udało się sprawdzić EAN. Ponów sprawdzenie przed dodaniem produktu.</Text>
      <Pressable accessibilityRole="button" onPress={() => {
        setManualLookup(null);
        setManualLookupAttempt(attempt => attempt + 1);
      }}>
        <Text style={styles.backText}>Ponów sprawdzenie EAN</Text>
      </Pressable>
    </View>
  ) : manualNameLookupFailed ? (
    <View>
      <Text style={styles.info}>Nie udało się sprawdzić nazwy. Ponów sprawdzenie przed dodaniem produktu.</Text>
      <Pressable accessibilityRole="button" onPress={() => {
        setManualNameLookup(null);
        setManualNameLookupAttempt(attempt => attempt + 1);
      }}>
        <Text style={styles.backText}>Ponów sprawdzenie nazwy</Text>
      </Pressable>
    </View>
  ) : null;

  const sheetHeader = sheetMode === 'details' && scannedProduct ? (
    <View style={[styles.productRow, styles.sheetHeader]}>
      {scannedProduct.imageUrl ? (
        <Pressable testID="scanned-photo-preview" accessibilityRole="button" accessibilityLabel="Powiększ zdjęcie produktu" onPress={photoPreview.open}>
          <Image source={{uri: scannedProduct.imageUrl}} style={styles.productImage} />
        </Pressable>
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
  ) : sheetMode === 'manualWithEan' || sheetMode === 'manualNoEan' ? (
    <View style={[styles.sheetHeader, styles.manualHeader, {height: Math.ceil(MANUAL_HEADER_LINE_HEIGHT * MANUAL_HEADER_LINES * fontScale)}]}>
      <Text testID="manual-product-title" accessibilityRole="header" numberOfLines={MANUAL_HEADER_LINES} style={[styles.productName, styles.manualHeaderTitle]}>
        {existingManualProduct ? 'Dodaj produkt z katalogu' : 'Dodaj produkt ręcznie'}
      </Text>
    </View>
  ) : null;

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
      <Pressable
        onPress={openManualNoEanForm}
        style={[styles.manualOverlayButton, {top: Math.max(insets.top, 12)}]}
        disabled={resolving || adding}>
        <Text style={styles.manualOverlayButtonText}>Dodaj ręcznie</Text>
      </Pressable>

      <DraggableBottomSheet
        visible={resolving || sheetMode !== 'none'}
        accessibilityLabel="Zamknij dodawanie produktu"
        onClose={() => {
          if (!photoPreview.close() && !resolving && !adding) {
            closeBottomSheet();
          }
        }}
        accessibilityContentHidden={photoPreview.visible}
        sheetStyle={[
          styles.addProductSheet,
          (sheetMode === 'manualWithEan' || sheetMode === 'manualNoEan') && {
            maxHeight: sheetFormMaxHeight,
          },
          {paddingBottom: Math.max(insets.bottom, 12)},
        ]}
        handleStyle={styles.sheetHandleTouch}
        handleContent={sheetHeader}
        overlay={<><AppToast toast={toast} animatedValue={toastAnim} top={toastTop} />{photoPreview.overlay}</>}>
        {resolving ? (
          <View style={styles.resolvingBox}>
            <ActivityIndicator color={colors.success} />
            <Text style={styles.info}>Pobieram dane produktu…</Text>
          </View>
        ) : null}
        {sheetMode === 'details' && scannedProduct ? (
          <View style={styles.sheetContent}>
            <View style={styles.expirationSection}>
              <Text style={styles.inputLabel}>
                Data ważności: {expirationDate
                  ? formatDate(
                      expirationDate.getDate(),
                      expirationDate.getMonth() + 1,
                      expirationDate.getFullYear(),
                    )
                  : 'brak'}
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
                    Ustaw datę
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
                    Bez daty
                  </Text>
                </Pressable>
              </View>
              {expirationDate ? (
                <View style={styles.wheelsRow}>
                  <WheelPicker
                    label="Dzień"
                    values={days}
                    selectedValue={expirationDate.getDate()}
                    onValueChange={value => updateDatePart('day', value)}
                  />
                  <WheelPicker
                    label="Miesiąc"
                    values={months}
                    selectedValue={expirationDate.getMonth() + 1}
                    onValueChange={value => updateDatePart('month', value)}
                  />
                  <WheelPicker
                    label="Rok"
                    values={years}
                    selectedValue={expirationDate.getFullYear()}
                    onValueChange={value => updateDatePart('year', value)}
                  />
                </View>
              ) : null}
              
              <Text style={styles.inputLabel}>Ilość</Text>
              <QuantityStepper
                value={amount}
                busy={adding || resolving}
                onDecrease={() => setAmount(current => Math.max(1, current - 1))}
                onIncrease={() => setAmount(current => Math.min(999, current + 1))}
              />
            </View>

            <View style={styles.actions}>
              <Pressable
                style={[styles.actionButtonBase, styles.secondaryButton]}
                onPress={closeBottomSheet}
                disabled={adding}>
                <Text style={[styles.actionButtonTextBase, styles.secondaryButtonText]}>Zamknij</Text>
              </Pressable>
              <Pressable
                style={[styles.actionButtonBase, styles.primaryButton, adding && styles.buttonDisabled]}
                onPress={() => {
                  handleAddProduct().catch(() => {});
                }}
                disabled={adding || resolving}>
                <Text style={[styles.actionButtonTextBase, styles.primaryButtonText]}>
                  {adding ? 'Dodaję…' : 'Dodaj'}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        {sheetMode === 'manualWithEan' ? (
          <SheetScrollableForm
            maxHeight={sheetFormMaxHeight - Math.max(insets.bottom, 12) - 14}
            keyboardVerticalOffset={sheetKeyboardOffset}
            contentBottomInset={sheetContentBottomInset}>
            <Text style={styles.inputLabel}>EAN</Text>
            <TextInput
              value={manualEan}
              style={styles.textInput}
              editable={false}
              selectTextOnFocus={false}
            />
            {manualLookupError}
            <Text style={styles.inputLabel}>Nazwa produktu</Text>
            <TextInput
              value={existingEanProduct ? existingEanProduct.name : manualName}
              onChangeText={changeManualName}
              editable={!manualNameLocked}
              style={styles.textInput}
              placeholder="Np. Makaron pełnoziarnisty"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.inputLabel}>Marka (opcjonalnie)</Text>
            <TextInput
              value={existingManualProduct ? existingManualProduct.brand ?? '' : manualBrand}
              onChangeText={setManualBrand}
              editable={!manualSharedFieldsLocked}
              style={styles.textInput}
              placeholder="Np. Barilla"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.inputLabel}>Kategoria (opcjonalnie)</Text>
            <TextInput
              value={existingManualProduct ? existingManualProduct.category ?? '' : manualCategory}
              onChangeText={setManualCategory}
              editable={!manualSharedFieldsLocked}
              style={styles.textInput}
              placeholder="Np. Produkty suche"
              placeholderTextColor={colors.textMuted}
            />
            <ProductPhotoPicker
              onPreview={photoPreview.open}
              imageUri={existingManualProduct ? existingManualProduct.imageUrl ?? null : manualPhotoUri}
              disabled={manualSharedFieldsLocked}
              picking={photoPicking}
              onTakePhoto={() => {
                pickProductPhoto('camera').catch(() => {});
              }}
              onPickFromLibrary={() => {
                pickProductPhoto('library').catch(() => {});
              }}
              onClear={clearManualPhoto}
            />
            <View style={styles.expirationSection}>
              <Text style={styles.inputLabel}>
                Data ważności: {expirationDate
                  ? formatDate(
                      expirationDate.getDate(),
                      expirationDate.getMonth() + 1,
                      expirationDate.getFullYear(),
                    )
                  : 'brak'}
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
                    Ustaw datę
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
                    Bez daty
                  </Text>
                </Pressable>
              </View>
            </View>
            <ManualFormFooter
              expirationDate={expirationDate}
              days={days}
              months={months}
              years={years}
              updateDatePart={updateDatePart}
              amount={amount}
              setAmount={setAmount}
              adding={adding}
              resolving={resolving || photoPicking || manualLookupBlocked}
              onClose={closeBottomSheet}
              onSave={() => {
                handleSaveManualProduct().catch(() => {});
              }}
              saveLabel="Zapisz i dodaj"
              savingLabel="Zapisuję…"
            />
          </SheetScrollableForm>
        ) : null}
        {sheetMode === 'manualNoEan' ? (
          <SheetScrollableForm
            maxHeight={sheetFormMaxHeight - Math.max(insets.bottom, 12) - 14}
            keyboardVerticalOffset={sheetKeyboardOffset}
            contentBottomInset={sheetContentBottomInset}>
            <Text style={styles.inputLabel}>EAN (opcjonalnie)</Text>
            <TextInput
              value={manualEan}
              onChangeText={changeManualEan}
              editable={!adding && !photoPicking}
              style={styles.textInput}
              placeholder="Np. 5901234123457"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
            />
            {manualLookupError}
            <Text style={styles.inputLabel}>Nazwa produktu</Text>
            <TextInput
              value={existingEanProduct ? existingEanProduct.name : manualName}
              onChangeText={changeManualName}
              editable={!manualNameLocked}
              style={styles.textInput}
              placeholder="Np. Domowy zakwas"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.inputLabel}>Marka (opcjonalnie)</Text>
            <TextInput
              value={existingManualProduct ? existingManualProduct.brand ?? '' : manualBrand}
              onChangeText={setManualBrand}
              editable={!manualSharedFieldsLocked}
              style={styles.textInput}
              placeholder="Np. Barilla"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.inputLabel}>Kategoria (opcjonalnie)</Text>
            <TextInput
              value={existingManualProduct ? existingManualProduct.category ?? '' : manualCategory}
              onChangeText={setManualCategory}
              editable={!manualSharedFieldsLocked}
              style={styles.textInput}
              placeholder="Np. Produkty suche"
              placeholderTextColor={colors.textMuted}
            />
            <ProductPhotoPicker
              onPreview={photoPreview.open}
              imageUri={existingManualProduct ? existingManualProduct.imageUrl ?? null : manualPhotoUri}
              disabled={manualSharedFieldsLocked}
              picking={photoPicking}
              onTakePhoto={() => {
                pickProductPhoto('camera').catch(() => {});
              }}
              onPickFromLibrary={() => {
                pickProductPhoto('library').catch(() => {});
              }}
              onClear={clearManualPhoto}
            />
            <View style={styles.expirationSection}>
              <Text style={styles.inputLabel}>
                Data ważności: {expirationDate
                  ? formatDate(
                      expirationDate.getDate(),
                      expirationDate.getMonth() + 1,
                      expirationDate.getFullYear(),
                    )
                  : 'brak'}
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
                    Ustaw datę
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
                    Bez daty
                  </Text>
                </Pressable>
              </View>
            </View>
            <ManualFormFooter
              expirationDate={expirationDate}
              days={days}
              months={months}
              years={years}
              updateDatePart={updateDatePart}
              amount={amount}
              setAmount={setAmount}
              adding={adding}
              resolving={resolving || photoPicking || manualLookupBlocked}
              onClose={closeBottomSheet}
              onSave={() => {
                handleSaveManualProduct().catch(() => {});
              }}
              saveLabel="Zapisz i dodaj"
              savingLabel="Dodaję…"
            />
          </SheetScrollableForm>
        ) : null}
      </DraggableBottomSheet>
      <AppToast toast={toast} animatedValue={toastAnim} top={toastTop} />
    </View>
  );
}

function ProductScannerContent({onRequestClose, onProductAdded}: ProductScannerViewProps) {
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

export default function ProductScannerView({onRequestClose, onProductAdded, onCatalogProductUpdated}: ProductScannerViewProps) {
  const [catalogOpen, setCatalogOpen] = useState(false);
  const insets = useSafeAreaInsets();
  if (catalogOpen) {
    return <ProductCatalogView onRequestClose={() => setCatalogOpen(false)} onProductUpdated={onCatalogProductUpdated} />;
  }
  return (
    <View style={styles.container}>
      <ProductScannerContent onRequestClose={onRequestClose} onProductAdded={onProductAdded} />
      <Pressable
        testID="open-product-catalog"
        accessibilityRole="button"
        onPress={() => setCatalogOpen(true)}
        style={[styles.catalogButton, {top: Math.max(insets.top, 12) + (onRequestClose ? 44 : 0)}]}>
        <Text style={styles.catalogButtonText}>Katalog produktów</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  catalogButton: {
    position: 'absolute',
    left: 16,
    zIndex: 20,
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  catalogButtonText: {color: colors.textPrimary, fontSize: 13, fontWeight: '700'},
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    backgroundColor: colors.surface,
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
    color: colors.accent,
    fontSize: 16,
    fontWeight: '700',
  },
  manualOverlayButton: {
    position: 'absolute',
    right: 16,
    zIndex: 20,
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
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
    color: colors.textSecondary,
    textAlign: 'center',
  },
  overlayInfo: {
    color: colors.textSecondary,
    fontSize: 13,
    marginBottom: 2,
  },
  scanValue: {
    color: colors.accent,
    fontWeight: '700',
  },
  addProductSheet: {
    paddingHorizontal: 16,
    paddingTop: 4,
    maxHeight: '92%',
  },
  sheetHandleTouch: {
    alignSelf: 'stretch',
    width: 'auto',
    minHeight: 44,
    marginHorizontal: -16,
    marginTop: -4,
    marginBottom: 0,
    paddingHorizontal: 16,
    justifyContent: 'flex-start',
    paddingTop: 10,
  },
  sheetHeader: {
    alignSelf: 'stretch',
    marginTop: 8,
    marginBottom: 14,
  },
  manualHeader: {
    justifyContent: 'center',
  },
  manualHeaderTitle: {
    lineHeight: MANUAL_HEADER_LINE_HEIGHT,
    includeFontPadding: false,
  },
  sheetContent: {
    gap: 14,
  },
  sheetKeyboardAvoid: {
    flexGrow: 0,
    flexShrink: 1,
  },
  sheetScroll: {
    ...shadowGutters.viewport,
    flexGrow: 0,
    flexShrink: 1,
  },
  sheetScrollContent: {
    ...shadowGutters.content,
    gap: 14,
  },
  resolvingBox: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  productRow: {
    ...shadows.preview,
    flexDirection: 'row',
    gap: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 12,
  },
  productImage: {
    width: 84,
    height: 84,
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted,
  },
  productMeta: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  productName: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '900',
  },
  productProducer: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  productEan: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  expirationSection: {
    gap: 8,
  },
  inputLabel: {
    color: colors.textPrimary,
    fontWeight: '900',
  },
  textInput: {
    ...shadows.control,
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  photoSection: {
    gap: 8,
  },
  photoRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  manualPhotoPreview: {
    width: 72,
    height: 72,
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  manualPhotoPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    shadowColor: colors.shadow,
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 3},
    elevation: 1,
  },
  manualPhotoPlaceholderText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  photoActions: {
    flex: 1,
    gap: 8,
  },
  wheelsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  expirationToggleRow: {
    flexDirection: 'row',
    gap: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 3,
    shadowColor: colors.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 3},
    elevation: 1,
  },
  expirationToggleButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expirationToggleButtonActive: {
    backgroundColor: colors.success,
  },
  expirationToggleText: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  expirationToggleTextActive: {
    color: colors.successText,
  },
  quantityStepper: {
    alignSelf: 'stretch',
    height: 52,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 3},
    elevation: 1,
  },
  stepButton: {
    width: 48,
    height: 50,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSubtle,
  },
  stepText: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '900',
  },
  quantityText: {
    flex: 1,
    textAlign: 'center',
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '900',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButtonBase: {
    flex: 1,
    minHeight: 52,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonTextBase: {
    fontSize: 15,
    fontWeight: '900',
  },
  secondaryButton: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 3},
    elevation: 1,
  },
  secondaryButtonText: {
    color: colors.textPrimary,
  },
  primaryButton: {
    backgroundColor: colors.success,
    shadowColor: colors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 3},
    elevation: 2,
  },
  primaryButtonText: {
    color: colors.successText,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.78,
  },
});
