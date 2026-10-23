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

// Both adding and editing store a private copy rather than a temporary picker URI.
export async function selectProductPhoto(source: ProductPhotoSource): Promise<string | null> {
  if (!imagePicker) {
    throw new Error('Nie udało się uruchomić wyboru zdjęcia');
  }
  const launcher = source === 'camera' ? imagePicker.launchCamera : imagePicker.launchImageLibrary;
  if (typeof launcher !== 'function') {
    throw new Error('Ten sposób dodania zdjęcia jest niedostępny');
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
    throw new Error(response.errorMessage || 'Nie udało się dodać zdjęcia');
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
    throw new Error('Nie udało się zapisać zdjęcia w pamięci aplikacji');
  }
  return `file://${destinationPath}`;
}
