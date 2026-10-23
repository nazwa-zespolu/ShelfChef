import {PermissionsAndroid, Platform} from 'react-native';

const imagePicker = (() => {
  try {
    return require('react-native-image-picker');
  } catch {
    return null;
  }
})();

const fileSystem = (() => {
  try {
    return require('@dr.pogodin/react-native-fs');
  } catch {
    return null;
  }
})();

export type ProductPhotoSource = 'camera' | 'library';

export class ProductPhotoPermissionError extends Error {
  constructor(readonly code: 'denied' | 'blocked') {
    super(code === 'blocked'
      ? 'Dostęp do aparatu jest zablokowany. Włącz go w ustawieniach aplikacji.'
      : 'Brak zgody na użycie aparatu. Zezwól na dostęp, aby zrobić zdjęcie.');
    this.name = 'ProductPhotoPermissionError';
  }
}

async function ensureCameraPermission(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  let result: Awaited<ReturnType<typeof PermissionsAndroid.request>>;
  try {
    if (await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA)) {
      return;
    }
    result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
  } catch {
    throw new Error('Nie udało się sprawdzić dostępu do aparatu. Spróbuj ponownie.');
  }
  if (result === PermissionsAndroid.RESULTS.GRANTED) {
    return;
  }
  throw new ProductPhotoPermissionError(result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ? 'blocked' : 'denied');
}

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
  const fileExtension = asset.fileName?.trim().match(/\.([a-zA-Z0-9]+)$/)?.[1];
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

async function discardPhotoCopy(uri: string): Promise<boolean> {
  const prefix = `file://${fileSystem?.DocumentDirectoryPath}/product-photos/`;
  if (!uri.startsWith(prefix) || !/^product-\d+-\d+\.[a-z0-9]+$/.test(uri.slice(prefix.length))) {
    return false;
  }
  const path = uri.slice('file://'.length);
  try {
    if (await fileSystem.exists(path)) {
      await fileSystem.unlink(path);
    }
    return true;
  } catch (error) {
    console.warn('[ShelfChef] Could not remove draft product photo', error);
    return false;
  }
}

// Both adding and editing store a private copy rather than a temporary picker URI.
export async function selectProductPhoto(source: ProductPhotoSource): Promise<string | null> {
  if (!imagePicker) {
    throw new Error('Nie udało się uruchomić wyboru zdjęcia');
  }
  const launcher = source === 'camera' ? imagePicker.launchCamera : imagePicker.launchImageLibrary;
  if (typeof launcher !== 'function') {
    throw new Error('Ten sposób dodania zdjęcia jest niedostępny');
  }
  if (source === 'camera') {
    await ensureCameraPermission();
  }
  let response: ImagePickerResponse;
  try {
    response = await launcher({
      mediaType: 'photo', selectionLimit: 1, quality: 0.82, includeBase64: false,
    });
  } catch {
    throw new Error('Nie udało się dodać zdjęcia');
  }
  if (response.didCancel) {
    return null;
  }
  if (response.errorCode) {
    if (source === 'camera' && response.errorCode === 'permission') {
      throw new ProductPhotoPermissionError('blocked');
    }
    throw new Error('Nie udało się dodać zdjęcia');
  }
  const asset = response.assets?.[0];
  const sourceUri = asset?.uri?.trim();
  if (!asset || !sourceUri) {
    throw new Error('Nie udało się odczytać wybranego zdjęcia');
  }
  if (!fileSystem?.DocumentDirectoryPath || !fileSystem?.mkdir || !fileSystem?.copyFile) {
    throw new Error('Nie udało się zapisać zdjęcia w pamięci aplikacji');
  }
  const directory = `${fileSystem.DocumentDirectoryPath}/product-photos`;
  const extension = extensionFromPhotoAsset(asset);
  const fileName = `product-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}.${extension}`;
  const destinationPath = `${directory}/${fileName}`;
  try {
    await fileSystem.mkdir(directory);
    await fileSystem.copyFile(sourceUri, destinationPath);
  } catch {
    await discardPhotoCopy(`file://${destinationPath}`);
    throw new Error('Nie udało się zapisać zdjęcia w pamięci aplikacji');
  }
  return `file://${destinationPath}`;
}

// Owns only copies created in this editing session, never a product's stored photo.
export class ProductPhotoDraft {
  private readonly copies = new Set<string>();
  private readonly deleting = new Map<string, Promise<void>>();
  private current: string | null = null;
  private disposed = false;
  private saving = false;
  private savingPhoto: string | null = null;

  async select(source: ProductPhotoSource): Promise<string | null> {
    if (this.disposed || this.saving) {
      return null;
    }
    const uri = await selectProductPhoto(source);
    if (!uri) {
      return null;
    }
    this.copies.add(uri);
    if (this.disposed) {
      await this.remove(uri);
      return null;
    }
    const previous = this.current;
    this.current = uri;
    if (previous) {
      await this.remove(previous);
    }
    return this.disposed ? null : uri;
  }

  async clear(): Promise<void> {
    if (this.saving) {
      return;
    }
    const previous = this.current;
    this.current = null;
    if (previous) {
      await this.remove(previous);
    }
  }

  async save(persist: () => Promise<boolean>): Promise<boolean> {
    if (this.disposed || this.saving) {
      return false;
    }
    this.saving = true;
    const photo = this.current;
    this.savingPhoto = photo;
    try {
      const saved = await persist();
      if (saved && photo) {
        this.copies.delete(photo);
      }
      return saved;
    } finally {
      this.savingPhoto = null;
      this.saving = false;
      if (this.disposed) {
        await this.dispose();
      }
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.current = null;
    await Promise.all(Array.from(this.copies, uri => this.remove(uri)));
  }

  private async remove(uri: string): Promise<void> {
    if (!this.copies.has(uri) || uri === this.savingPhoto) {
      return;
    }
    const pending = this.deleting.get(uri);
    if (pending) {
      return pending;
    }
    const deletion = discardPhotoCopy(uri).then(removed => {
      if (removed) {
        this.copies.delete(uri);
      }
    }).finally(() => { this.deleting.delete(uri); });
    this.deleting.set(uri, deletion);
    return deletion;
  }
}
