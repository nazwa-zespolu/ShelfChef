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
import {Camera as CameraIcon, ImagePlus, Trash2} from 'lucide-react-native';
import WheelPicker from './components/WheelPicker';
import {ProductDefinition} from './domain/types';
import {getProductRepository, getScanToAdd} from './app/services';
import {colors} from './theme/colors';
import {DraggableBottomSheet} from './shopping-lists/modals/DraggableBottomSheet';
import {AppToast, useAppToast} from './components/AppToast';

const visionCamera = (() => {
  try {
    // Runtime require keeps Jest/tests working when native module is missing.
    return require('react-native-vision-camera');
  } catch {
    return null;
  }
})();

const imagePicker = (() => {
  try {
    // Runtime require keeps Jest/tests working when native module is missing.
    return require('react-native-image-picker');
  } catch {
    return null;
  }
})();

const fileSystem = (() => {
  try {
    // Runtime require keeps Jest/tests working when native module is missing.
    return require('@dr.pogodin/react-native-fs');
  } catch {
    return null;
  }
})();

const PRODUCT_PHOTO_DIR_NAME = 'product-photos';

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

type ProductPhotoSource = 'camera' | 'library';

type ImagePickerAsset = {
  uri?: string;
  fileName?: string;
  type?: string;
};

type ImagePickerResponse = {
  didCancel?: boolean;
  errorCode?: string;
  errorMessage?: string;
  assets?: ImagePickerAsset[];
};

function extensionFromPhotoAsset(asset: ImagePickerAsset): string {
  const fileName = asset.fileName?.trim();
  const fileExtension = fileName?.match(/\.([a-zA-Z0-9]+)$/)?.[1];
  if (fileExtension) {
    return fileExtension.toLowerCase();
  }
  if (asset.type?.includes('png')) {
    return 'png';
  }
  if (asset.type?.includes('webp')) {
    return 'webp';
  }
  return 'jpg';
}

async function copyProductPhotoToAppStorage(asset: ImagePickerAsset): Promise<string | null> {
  const sourceUri = asset.uri?.trim();
  if (!sourceUri) {
    return null;
  }
  if (!fileSystem?.DocumentDirectoryPath || !fileSystem?.mkdir || !fileSystem?.copyFile) {
    return sourceUri;
  }

  const directory = `${fileSystem.DocumentDirectoryPath}/${PRODUCT_PHOTO_DIR_NAME}`;
  const extension = extensionFromPhotoAsset(asset);
  const fileName = `product-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}.${extension}`;
  const destinationPath = `${directory}/${fileName}`;
  await fileSystem.mkdir(directory);
  await fileSystem.copyFile(sourceUri, destinationPath);
  return `file://${destinationPath}`;
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
            {paddingBottom: contentBottomInset},
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
};

function ProductPhotoPicker({
  imageUri,
  disabled,
  picking,
  onTakePhoto,
  onPickFromLibrary,
  onClear,
}: ProductPhotoPickerProps) {
  return (
    <View style={styles.photoSection}>
      <Text style={styles.inputLabel}>Zdjęcie produktu</Text>
      <View style={styles.photoRow}>
        {imageUri ? (
          <Image source={{uri: imageUri}} style={styles.manualPhotoPreview} />
        ) : (
          <View style={styles.manualPhotoPlaceholder}>
            <Text style={styles.manualPhotoPlaceholderText}>Brak zdjęcia</Text>
          </View>
        )}
        <View style={styles.photoActions}>
          <View style={styles.photoActionRow}>
            <Pressable
              style={[styles.photoButton, disabled && styles.buttonDisabled]}
              onPress={onTakePhoto}
              disabled={disabled}>
              <CameraIcon color={colors.textPrimary} size={17} strokeWidth={2.2} />
              <Text style={styles.photoButtonText}>{picking ? 'Wybieram…' : 'Aparat'}</Text>
            </Pressable>
            <Pressable
              style={[styles.photoButton, disabled && styles.buttonDisabled]}
              onPress={onPickFromLibrary}
              disabled={disabled}>
              <ImagePlus color={colors.textPrimary} size={17} strokeWidth={2.2} />
              <Text style={styles.photoButtonText}>Galeria</Text>
            </Pressable>
          </View>
          {imageUri ? (
            <Pressable style={styles.photoClearButton} onPress={onClear} disabled={disabled}>
              <Trash2 color={colors.warning} size={16} strokeWidth={2.2} />
              <Text style={styles.photoClearButtonText}>Usuń zdjęcie</Text>
            </Pressable>
          ) : null}
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
  const {height: windowHeight} = useWindowDimensions();
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
  const [expirationDate, setExpirationDate] = useState<Date | null>(null);
  const [amount, setAmount] = useState(1);
  const [resolving, setResolving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [photoPicking, setPhotoPicking] = useState(false);
  const lastAcceptedScanRef = useRef<{code: string; scannedAt: number} | null>(null);
  const resolveRequestIdRef = useRef(0);
  const scanToAdd = useMemo(() => getScanToAdd(), []);
  const repo = useMemo(() => getProductRepository(), []);
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
    setSheetMode('none');
    setScannedProduct(null);
  };

  const pickProductPhoto = async (source: ProductPhotoSource) => {
    if (!imagePicker) {
      showToast('Nie udało się uruchomić wyboru zdjęcia', 'error');
      return;
    }

    const launcher =
      source === 'camera' ? imagePicker.launchCamera : imagePicker.launchImageLibrary;
    if (typeof launcher !== 'function') {
      showToast('Ten sposób dodania zdjęcia jest niedostępny', 'error');
      return;
    }

    setPhotoPicking(true);
    try {
      const response: ImagePickerResponse = await launcher({
        mediaType: 'photo',
        selectionLimit: 1,
        quality: 0.82,
        includeBase64: false,
      });
      if (response.didCancel) {
        return;
      }
      if (response.errorCode) {
        showToast(response.errorMessage || 'Nie udało się dodać zdjęcia', 'error');
        return;
      }

      const pickedAsset = response.assets?.[0];
      const storedUri = pickedAsset ? await copyProductPhotoToAppStorage(pickedAsset) : null;
      if (storedUri) {
        setManualPhotoUri(storedUri);
      }
    } catch {
      showToast('Nie udało się dodać zdjęcia', 'error');
    } finally {
      setPhotoPicking(false);
    }
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
      showToast(formatAddSuccessMessage(scannedProduct.name, amount));
    } catch {
      showToast('Nie udało się dodać produktu', 'error');
    } finally {
      setAdding(false);
    }
  };

  const handleSaveManualWithEan = async () => {
    const normalizedName = manualName.trim();
    const normalizedEan = manualEan.trim();
    if (!normalizedName) {
      showToast('Podaj nazwę produktu', 'error');
      return;
    }
    if (!isValidEAN(normalizedEan)) {
      showToast('Nie udało się zapisać bez poprawnego EAN', 'error');
      return;
    }

    setAdding(true);
    try {
      await repo.saveDefinition({
        ean: normalizedEan,
        name: normalizedName,
        brand: manualBrand.trim() || undefined,
        category: manualCategory.trim() || undefined,
        imageUrl: manualPhotoUri ?? undefined,
      });
      const expiryDate = expirationDate ? formatExpiryForDb(expirationDate) : null;
      for (let i = 0; i < amount; i += 1) {
        await repo.addToInventory(generateInventoryId(i), normalizedEan, null, expiryDate);
      }
      closeBottomSheet();
      onProductAdded?.();
      showToast(formatAddSuccessMessage(normalizedName, amount));
    } catch {
      showToast('Nie udało się zapisać produktu', 'error');
    } finally {
      setAdding(false);
    }
  };

  const handleSaveManualNoEan = async () => {
    const normalizedName = manualName.trim();
    const normalizedEan = manualEan.trim();
    if (!normalizedName) {
      showToast('Podaj nazwę produktu', 'error');
      return;
    }
    if (normalizedEan && !isValidEAN(normalizedEan)) {
      showToast('Popraw EAN albo zostaw to pole puste', 'error');
      return;
    }

    setAdding(true);
    try {
      const expiryDate = expirationDate ? formatExpiryForDb(expirationDate) : null;
      if (normalizedEan) {
        await repo.saveDefinition({
          ean: normalizedEan,
          name: normalizedName,
          brand: manualBrand.trim() || undefined,
          category: manualCategory.trim() || undefined,
          imageUrl: manualPhotoUri ?? undefined,
        });
        for (let i = 0; i < amount; i += 1) {
          await repo.addToInventory(generateInventoryId(i), normalizedEan, null, expiryDate);
        }
      } else {
        await repo.saveGenericCatalogProduct(normalizedName, manualPhotoUri);
        for (let i = 0; i < amount; i += 1) {
          await repo.addToInventory(generateInventoryId(i), null, normalizedName, expiryDate);
        }
      }
      closeBottomSheet();
      onProductAdded?.();
      showToast(formatAddSuccessMessage(normalizedName, amount));
    } catch {
      showToast('Nie udało się dodać produktu', 'error');
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
        onClose={resolving || adding ? () => {} : closeBottomSheet}
        sheetStyle={[
          styles.addProductSheet,
          (sheetMode === 'manualWithEan' || sheetMode === 'manualNoEan') && {
            maxHeight: sheetFormMaxHeight,
          },
          {paddingBottom: Math.max(insets.bottom, 12)},
        ]}
        handleStyle={styles.sheetHandleTouch}
        overlay={<AppToast toast={toast} animatedValue={toastAnim} top={toastTop} />}>
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
            <Text style={styles.productName}>Dodaj produkt ręcznie</Text>
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
              placeholder="Np. Produkty suche"
              placeholderTextColor={colors.textMuted}
            />
            <ProductPhotoPicker
              imageUri={manualPhotoUri}
              disabled={adding || resolving || photoPicking}
              picking={photoPicking}
              onTakePhoto={() => {
                pickProductPhoto('camera').catch(() => {});
              }}
              onPickFromLibrary={() => {
                pickProductPhoto('library').catch(() => {});
              }}
              onClear={() => setManualPhotoUri(null)}
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
              resolving={resolving || photoPicking}
              onClose={closeBottomSheet}
              onSave={() => {
                handleSaveManualWithEan().catch(() => {});
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
            <Text style={styles.productName}>Dodaj produkt ręcznie</Text>
            <Text style={styles.inputLabel}>EAN (opcjonalnie)</Text>
            <TextInput
              value={manualEan}
              onChangeText={setManualEan}
              style={styles.textInput}
              placeholder="Np. 5901234123457"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
            />
            <Text style={styles.inputLabel}>Nazwa produktu</Text>
            <TextInput
              value={manualName}
              onChangeText={setManualName}
              style={styles.textInput}
              placeholder="Np. Domowy zakwas"
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
              placeholder="Np. Produkty suche"
              placeholderTextColor={colors.textMuted}
            />
            <ProductPhotoPicker
              imageUri={manualPhotoUri}
              disabled={adding || resolving || photoPicking}
              picking={photoPicking}
              onTakePhoto={() => {
                pickProductPhoto('camera').catch(() => {});
              }}
              onPickFromLibrary={() => {
                pickProductPhoto('library').catch(() => {});
              }}
              onClear={() => setManualPhotoUri(null)}
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
              resolving={resolving || photoPicking}
              onClose={closeBottomSheet}
              onSave={() => {
                handleSaveManualNoEan().catch(() => {});
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
    marginBottom: -8,
    paddingHorizontal: 16,
    justifyContent: 'flex-start',
    paddingTop: 10,
  },
  sheetContent: {
    gap: 14,
  },
  sheetKeyboardAvoid: {
    flexGrow: 0,
    flexShrink: 1,
  },
  sheetScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  sheetScrollContent: {
    gap: 14,
    paddingBottom: 8,
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
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 12,
    shadowColor: colors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 4},
    elevation: 2,
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
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 3},
    elevation: 1,
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
  photoActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  photoButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 8,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 8,
    shadowColor: colors.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 3},
    elevation: 1,
  },
  photoButtonText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  photoClearButton: {
    minHeight: 34,
    borderRadius: 8,
    backgroundColor: colors.warningSoft,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 8,
    shadowColor: colors.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 3},
    elevation: 1,
  },
  photoClearButtonText: {
    color: colors.warning,
    fontSize: 12,
    fontWeight: '800',
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
