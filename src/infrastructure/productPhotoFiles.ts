import {db} from './db/init';

function getFileSystem() {
  try {
    return require('@dr.pogodin/react-native-fs');
  } catch {
    return null;
  }
}

const retained = new Map<string, number>();
const pending = new Set<string>();
const deleting = new Map<
  string,
  {unlinking: boolean; promise: Promise<boolean>}
>();

function managedPhotoPath(uri: string): string | null {
  if (!/^file:\/\/.+\/product-photos\/product-\d+-\d+\.[a-z0-9]+$/.test(uri)) {
    return null;
  }
  const directory = getFileSystem()?.DocumentDirectoryPath;
  if (typeof directory !== 'string' || !directory) {
    return null;
  }
  const prefix = `file://${directory}/product-photos/`;
  if (
    !uri.startsWith(prefix) ||
    !/^product-\d+-\d+\.[a-z0-9]+$/.test(uri.slice(prefix.length))
  ) {
    return null;
  }
  return uri.slice('file://'.length);
}

export function assertProductPhotoWritable(
  uri: string | null | undefined,
): void {
  if (uri && deleting.get(uri)?.unlinking) {
    throw new Error('Product photo is being deleted');
  }
}

export function retainProductPhoto(uri: string): () => Promise<void> {
  assertProductPhotoWritable(uri);
  retained.set(uri, (retained.get(uri) ?? 0) + 1);
  let released = false;
  return async () => {
    if (released) {
      return;
    }
    released = true;
    const count = (retained.get(uri) ?? 1) - 1;
    if (count > 0) {
      retained.set(uri, count);
    } else {
      retained.delete(uri);
      if (pending.has(uri)) {
        await removeUnusedPhoto(uri);
      }
    }
  };
}

function isReferenced(uri: string): boolean {
  const result = db.execute(
    `SELECT 1 FROM product_catalog WHERE image_url = ?
     UNION ALL SELECT 1 FROM product_definitions WHERE image_url = ? LIMIT 1`,
    [uri, uri],
  );
  if (!result?.rows) {
    throw new Error('Could not verify product photo references');
  }
  return result.rows.length > 0;
}

function removeUnusedPhoto(uri: string): Promise<boolean> {
  const active = deleting.get(uri);
  if (active) {
    return active.promise;
  }
  const removal = {unlinking: false, promise: Promise.resolve(false)};
  deleting.set(uri, removal);
  removal.promise = (async () => {
    try {
      const path = managedPhotoPath(uri);
      if (!path) {
        pending.delete(uri);
        return false;
      }
      if (retained.has(uri)) {
        return false;
      }
      if (isReferenced(uri)) {
        pending.delete(uri);
        return true;
      }
      const fileSystem = getFileSystem();
      if (!(await fileSystem.exists(path))) {
        pending.delete(uri);
        return true;
      }
      // A draft or a new database reference may appear while exists() is pending.
      if (retained.has(uri)) {
        return false;
      }
      if (isReferenced(uri)) {
        pending.delete(uri);
        return true;
      }
      // Writes of this URI are rejected until the native unlink has finished.
      removal.unlinking = true;
      await fileSystem.unlink(path);
      pending.delete(uri);
      return true;
    } catch (error) {
      console.warn('[ShelfChef] Could not remove unused product photo', error);
      return false;
    }
  })().finally(() => {
    deleting.delete(uri);
  });
  return removal.promise;
}

// Only URIs supplied by current operations are queued; old files are never scanned.
export async function cleanupUnusedProductPhotos(
  uris: Array<string | null | undefined>,
): Promise<void> {
  try {
    for (const uri of uris) {
      if (uri && managedPhotoPath(uri)) {
        pending.add(uri);
      }
    }
    // Failed filesystem operations can be retried by a later cleanup in this session.
    await Promise.all(Array.from(pending, uri => removeUnusedPhoto(uri)));
  } catch (error) {
    console.warn('[ShelfChef] Could not schedule product photo cleanup', error);
  }
}

export async function discardProductPhotoCopy(uri: string): Promise<boolean> {
  await cleanupUnusedProductPhotos([uri]);
  return managedPhotoPath(uri) != null && !pending.has(uri);
}
