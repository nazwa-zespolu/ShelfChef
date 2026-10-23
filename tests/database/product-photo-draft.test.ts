import {access, copyFile, mkdtemp, mkdir, readdir, rm, unlink, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {sqlite} from '../helpers/sqlite';

let mockPhotoDirectory = '';

jest.mock('react-native-quick-sqlite', () => ({open: () => sqlite}), {virtual: true});
jest.mock('react-native', () => ({Platform: {OS: 'ios'}}), {virtual: true});
jest.mock('react-native-image-picker', () => ({launchImageLibrary: jest.fn()}), {virtual: true});
jest.mock('@dr.pogodin/react-native-fs', () => ({
  get DocumentDirectoryPath() { return mockPhotoDirectory; },
  mkdir: jest.fn(), copyFile: jest.fn(), exists: jest.fn(), unlink: jest.fn(),
}), {virtual: true});

import {ProductPhotoDraft} from '../../src/infrastructure/productPhotos';
import {ProductRepository} from '../../src/infrastructure/ProductRepository';
import {db, setupDatabase} from '../../src/infrastructure/db/init';

const nativeFiles = jest.requireMock('@dr.pogodin/react-native-fs') as {
  mkdir: jest.Mock; copyFile: jest.Mock; exists: jest.Mock; unlink: jest.Mock;
};
const picker = jest.requireMock('react-native-image-picker') as {launchImageLibrary: jest.Mock};
const exists = async (path: string) => access(path).then(() => true, () => false);
const pathFor = (uri: string) => uri.slice('file://'.length);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(onResolve => { resolve = onResolve; });
  return {promise, resolve};
}

describe('Product photo draft ownership with real files and SQLite', () => {
  let products: ProductRepository;
  let source: string;
  const metadata = {name: 'Żurek', brand: 'Spichlerz', category: 'Zupy'};

  beforeEach(async () => {
    sqlite.reset();
    setupDatabase();
    products = new ProductRepository();
    mockPhotoDirectory = await mkdtemp(join(tmpdir(), 'shelfchef-photo-draft-'));
    source = join(mockPhotoDirectory, 'source.jpg');
    await writeFile(source, 'source photo');
    nativeFiles.mkdir.mockReset().mockImplementation((path: string) => mkdir(path, {recursive: true}));
    nativeFiles.copyFile.mockReset().mockImplementation((from: string, to: string) => copyFile(pathFor(from), to));
    nativeFiles.exists.mockReset().mockImplementation(exists);
    nativeFiles.unlink.mockReset().mockImplementation(unlink);
    picker.launchImageLibrary.mockReset().mockResolvedValue({assets: [{uri: `file://${source}`}]});
  });

  afterEach(async () => { await rm(mockPhotoDirectory, {recursive: true, force: true}); });
  afterAll(() => sqlite.close());

  const choose = async (draft: ProductPhotoDraft) => {
    const uri = await draft.select('library');
    expect(uri).not.toBeNull();
    expect(await exists(pathFor(uri!))).toBe(true);
    return uri!;
  };
  const createProduct = async (kind: 'generic' | 'specific') => {
    const imageUrl = `file://${source}`;
    if (kind === 'generic') {
      return products.saveGenericCatalogProduct({...metadata, imageUrl});
    }
    await products.saveDefinition({...metadata, imageUrl, ean: '5901234123457'});
    return (await products.findCatalogProductByEan('5901234123457'))!;
  };

  it('removes an abandoned copy while preserving the source and stored product photo', async () => {
    const product = await createProduct('generic');
    const draft = new ProductPhotoDraft();
    const uri = await choose(draft);

    await draft.dispose();
    sqlite.reopen();
    setupDatabase();

    expect(await exists(pathFor(uri))).toBe(false);
    expect(await exists(source)).toBe(true);
    expect(await products.findCatalogProductById(product.id)).toMatchObject({imageUrl: `file://${source}`});
  });

  it('removes superseded and cleared copies without touching the source', async () => {
    const draft = new ProductPhotoDraft();
    const first = await choose(draft);
    const second = await choose(draft);

    expect(await exists(pathFor(first))).toBe(false);
    await draft.clear();
    expect(await exists(pathFor(second))).toBe(false);
    expect(await exists(source)).toBe(true);
    await draft.dispose();
  });

  it('keeps the selected draft copy when the native picker is cancelled', async () => {
    const draft = new ProductPhotoDraft();
    const uri = await choose(draft);
    picker.launchImageLibrary.mockResolvedValueOnce({didCancel: true});

    expect(await draft.select('library')).toBeNull();
    expect(await exists(pathFor(uri))).toBe(true);
    await draft.dispose();
    expect(await exists(pathFor(uri))).toBe(false);
  });

  it.each(['generic', 'specific'] as const)('keeps a failed %s save retryable and protects the committed photo after reopening', async kind => {
    const product = await createProduct(kind);
    const draft = new ProductPhotoDraft();
    const uri = await choose(draft);
    const save = () => products.updateCatalogProduct(product.id, {...metadata, imageUrl: uri}).then(() => true, () => false);
    db.execute(`CREATE TRIGGER fail_draft_save BEFORE UPDATE ON product_catalog
      BEGIN SELECT RAISE(ABORT, 'test draft save failure'); END`);

    expect(await draft.save(save)).toBe(false);
    expect(await exists(pathFor(uri))).toBe(true);
    expect(await products.findCatalogProductById(product.id)).toMatchObject({imageUrl: `file://${source}`});
    db.execute('DROP TRIGGER fail_draft_save');
    expect(await draft.save(save)).toBe(true);
    await draft.dispose();
    sqlite.reopen();
    setupDatabase();

    expect(await products.findCatalogProductById(product.id)).toMatchObject({imageUrl: uri});
    expect(await exists(pathFor(uri))).toBe(true);
    expect(await exists(source)).toBe(true);
    if (product.productEan) {
      expect(await products.findDefinitionByEan(product.productEan)).toMatchObject({imageUrl: uri});
    }
  });

  it.each([true, false])('protects an in-flight file on disposal and uses the actual save result: %s', async saved => {
    const product = await createProduct('generic');
    const draft = new ProductPhotoDraft();
    const uri = await choose(draft);
    const gate = deferred<void>();
    if (!saved) {
      db.execute(`CREATE TRIGGER fail_pending_save BEFORE UPDATE ON product_catalog
        BEGIN SELECT RAISE(ABORT, 'test pending save failure'); END`);
    }
    const pending = draft.save(async () => {
      await gate.promise;
      return products.updateCatalogProduct(product.id, {...metadata, imageUrl: uri}).then(() => true, () => false);
    });

    await draft.dispose();
    expect(await exists(pathFor(uri))).toBe(true);
    gate.resolve();
    expect(await pending).toBe(saved);
    sqlite.reopen();
    setupDatabase();

    expect(await exists(pathFor(uri))).toBe(saved);
    expect(await products.findCatalogProductById(product.id)).toMatchObject({imageUrl: saved ? uri : `file://${source}`});
  });

  it('removes a copy that finishes after the draft has been disposed', async () => {
    const copying = deferred<void>();
    const started = deferred<void>();
    nativeFiles.copyFile.mockImplementationOnce(async (from: string, to: string) => {
      started.resolve();
      await copying.promise;
      await copyFile(pathFor(from), to);
    });
    const draft = new ProductPhotoDraft();
    const selection = draft.select('library');
    await started.promise;

    await draft.dispose();
    copying.resolve();
    expect(await selection).toBeNull();
    expect(await exists(nativeFiles.copyFile.mock.calls[0][1])).toBe(false);
    expect(await exists(source)).toBe(true);
  });

  it('removes a partially written file when copying fails', async () => {
    nativeFiles.copyFile.mockImplementationOnce(async (_from: string, to: string) => {
      await writeFile(to, 'partial photo');
      throw new Error('Disk full');
    });
    const draft = new ProductPhotoDraft();

    await expect(draft.select('library')).rejects.toThrow('Nie udało się zapisać zdjęcia w pamięci aplikacji');

    expect(await readdir(join(mockPhotoDirectory, 'product-photos'))).toEqual([]);
    expect(await exists(source)).toBe(true);
    await draft.dispose();
  });

  it('never deletes a committed copy when another draft is selected or cleared', async () => {
    const draft = new ProductPhotoDraft();
    const committed = await choose(draft);
    expect(await draft.save(async () => true)).toBe(true);
    const next = await choose(draft);

    await draft.clear();
    await draft.dispose();

    expect(await exists(pathFor(committed))).toBe(true);
    expect(await exists(pathFor(next))).toBe(false);
  });

  it('makes repeated disposal safe when a copy has already been removed', async () => {
    const draft = new ProductPhotoDraft();
    const uri = await choose(draft);
    await unlink(pathFor(uri));

    await draft.dispose();
    await draft.dispose();

    expect(await exists(source)).toBe(true);
  });

  it('retries a failed draft deletion without rejecting disposal', async () => {
    const draft = new ProductPhotoDraft();
    const uri = await choose(draft);
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
    nativeFiles.unlink.mockRejectedValueOnce(new Error('Temporary storage failure'));
    try {
      await draft.dispose();
      expect(await exists(pathFor(uri))).toBe(true);
      expect(warning).toHaveBeenCalledTimes(1);
      await draft.dispose();
      expect(await exists(pathFor(uri))).toBe(false);
    } finally {
      warning.mockRestore();
    }
  });

  it('shares an in-flight deletion when replacing and disposing overlap', async () => {
    const draft = new ProductPhotoDraft();
    const first = await choose(draft);
    const deleting = deferred<void>();
    const started = deferred<void>();
    nativeFiles.unlink.mockImplementationOnce(async (path: string) => {
      started.resolve();
      await deleting.promise;
      await unlink(path);
    });
    const replacement = draft.select('library');
    await started.promise;
    const disposal = draft.dispose();
    deleting.resolve();

    expect(await replacement).toBeNull();
    await disposal;
    expect(await readdir(join(mockPhotoDirectory, 'product-photos'))).toEqual([]);
    expect(nativeFiles.unlink.mock.calls.filter(([path]) => path === pathFor(first))).toHaveLength(1);
  });
});
