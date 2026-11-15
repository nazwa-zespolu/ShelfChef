import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {sqlite} from '../helpers/sqlite';

let mockPhotoDirectory = '';
jest.mock('react-native-quick-sqlite', () => ({open: () => sqlite}), {
  virtual: true,
});
jest.mock('react-native', () => ({Platform: {OS: 'ios'}}), {virtual: true});
jest.mock(
  'react-native-image-picker',
  () => ({launchImageLibrary: jest.fn()}),
  {virtual: true}
);
jest.mock(
  '@dr.pogodin/react-native-fs',
  () => ({
    get DocumentDirectoryPath() {
      return mockPhotoDirectory;
    },
    mkdir: jest.fn(),
    copyFile: jest.fn(),
    exists: jest.fn(),
    unlink: jest.fn(),
  }),
  {virtual: true}
);

import {ProductRepository} from '../../src/infrastructure/ProductRepository';
import {ProductPhotoDraft} from '../../src/infrastructure/productPhotos';
import {cleanupUnusedProductPhotos} from '../../src/infrastructure/productPhotoFiles';
import {db, setupDatabase} from '../../src/infrastructure/db/init';

const nativeFiles = jest.requireMock('@dr.pogodin/react-native-fs') as {
  mkdir: jest.Mock;
  copyFile: jest.Mock;
  exists: jest.Mock;
  unlink: jest.Mock;
};
const picker = jest.requireMock('react-native-image-picker') as {
  launchImageLibrary: jest.Mock;
};
const pathFor = (uri: string) => uri.slice('file://'.length);
const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false
  );
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return {promise, resolve};
};

describe('Unused product photo cleanup with real files and SQLite', () => {
  let products: ProductRepository;
  let source: string;
  let nextFile: number;
  let drafts: ProductPhotoDraft[];
  const metadata = {name: 'Jogurt', brand: 'Mleczarnia', category: 'Nabiał'};
  const photo = async () => {
    const path = join(
      mockPhotoDirectory,
      'product-photos',
      `product-1000-${++nextFile}.jpg`
    );
    await mkdir(join(mockPhotoDirectory, 'product-photos'), {recursive: true});
    await writeFile(path, 'photo');
    return `file://${path}`;
  };
  const createProduct = async (
    kind: 'generic' | 'specific',
    imageUrl: string
  ) => {
    if (kind === 'generic') {
      return products.saveGenericCatalogProduct({...metadata, imageUrl});
    }
    await products.saveDefinition({
      ...metadata,
      ean: '5901234123457',
      imageUrl,
    });
    return (await products.findCatalogProductByEan('5901234123457'))!;
  };
  const draftWithPhoto = async () => {
    const draft = new ProductPhotoDraft();
    drafts.push(draft);
    const uri = (await draft.select('library'))!;
    expect(await exists(pathFor(uri))).toBe(true);
    return {draft, uri};
  };

  beforeEach(async () => {
    sqlite.reset();
    setupDatabase();
    products = new ProductRepository();
    nextFile = 0;
    drafts = [];
    mockPhotoDirectory = await mkdtemp(
      join(tmpdir(), 'shelfchef-photo-cleanup-')
    );
    source = join(mockPhotoDirectory, 'source.jpg');
    await writeFile(source, 'source');
    nativeFiles.mkdir
      .mockReset()
      .mockImplementation((path: string) => mkdir(path, {recursive: true}));
    nativeFiles.copyFile
      .mockReset()
      .mockImplementation((from: string, to: string) =>
        copyFile(pathFor(from), to)
      );
    nativeFiles.exists.mockReset().mockImplementation(exists);
    nativeFiles.unlink.mockReset().mockImplementation(unlink);
    picker.launchImageLibrary
      .mockReset()
      .mockResolvedValue({assets: [{uri: `file://${source}`}]});
  });
  afterEach(async () => {
    for (const draft of drafts) {
      await draft.dispose();
    }
    await rm(mockPhotoDirectory, {recursive: true, force: true});
  });
  afterAll(() => sqlite.close());

  it.each(['generic', 'specific'] as const)(
    'removes replaced, cleared and deleted %s photos after commit without scanning old orphans',
    async (kind) => {
      const oldOrphan = await photo();
      const first = await photo();
      const product = await createProduct(kind, first);
      const second = await photo();
      nativeFiles.unlink.mockImplementation(async (path: string) => {
        const refs = db.execute(
          'SELECT 1 FROM product_catalog WHERE image_url = ? UNION ALL SELECT 1 FROM product_definitions WHERE image_url = ?',
          [`file://${path}`, `file://${path}`]
        ).rows!;
        expect(refs.length).toBe(0);
        await unlink(path);
      });

      await products.updateCatalogProduct(product.id, {
        ...metadata,
        imageUrl: second,
      });
      expect(await exists(pathFor(first))).toBe(false);
      expect(await exists(pathFor(second))).toBe(true);
      await products.updateCatalogProduct(product.id, {
        ...metadata,
        imageUrl: null,
      });
      expect(await exists(pathFor(second))).toBe(false);
      const third = await photo();
      await products.updateCatalogProduct(product.id, {
        ...metadata,
        imageUrl: third,
      });
      await products.deleteCatalogProduct(product.id);
      sqlite.reopen();
      setupDatabase();

      expect(await exists(pathFor(third))).toBe(false);
      expect(await exists(pathFor(oldOrphan))).toBe(true);
      expect(await exists(source)).toBe(true);
      expect(await products.findCatalogProductById(product.id)).toBeNull();
      expect(await products.getCatalogProducts()).toEqual([]);
    }
  );

  it.each(['catalog', 'definition'] as const)(
    'keeps a photo referenced by another %s row until its last use is deleted',
    async (reference) => {
      const shared = await photo();
      const product = await createProduct('generic', shared);
      const other =
        reference === 'catalog'
          ? await products.saveGenericCatalogProduct({
              name: 'Inny produkt',
              imageUrl: shared,
            })
          : await createProduct('specific', shared);
      const otherPhoto = await photo();
      if (reference === 'definition') {
        db.execute('UPDATE product_catalog SET image_url = ? WHERE id = ?', [
          otherPhoto,
          other.id,
        ]);
      }
      await products.updateCatalogProduct(product.id, {
        ...metadata,
        imageUrl: null,
      });
      expect(await exists(pathFor(shared))).toBe(true);
      await products.deleteCatalogProduct(product.id);
      expect(await exists(pathFor(shared))).toBe(true);
      await products.deleteCatalogProduct(other.id);
      expect(await exists(pathFor(shared))).toBe(false);
      if (reference === 'definition') {
        expect(await exists(pathFor(otherPhoto))).toBe(false);
      }
    }
  );

  it.each(['replace', 'metadata-only'] as const)(
    'cleans a shadowed definition photo during a specific %s edit',
    async (operation) => {
      const definitionPhoto = await photo();
      const product = await createProduct('specific', definitionPhoto);
      const catalogPhoto = await photo();
      db.execute('UPDATE product_catalog SET image_url = ? WHERE id = ?', [
        catalogPhoto,
        product.id,
      ]);
      const next = operation === 'replace' ? await photo() : catalogPhoto;
      await products.updateCatalogProduct(product.id, {
        ...metadata,
        ...(operation === 'replace' ? {imageUrl: next} : {}),
      });
      expect(await exists(pathFor(definitionPhoto))).toBe(false);
      expect(await exists(pathFor(catalogPhoto))).toBe(operation !== 'replace');
      expect(await exists(pathFor(next))).toBe(true);
      expect(
        await products.findDefinitionByEan(product.productEan!)
      ).toMatchObject({imageUrl: next});
    }
  );

  it.each(['update', 'delete'] as const)(
    'preserves files and both photo records when the database %s rolls back',
    async (operation) => {
      const uri = await photo();
      const product = await createProduct('specific', uri);
      const next = await photo();
      db.execute(`CREATE TRIGGER fail_catalog_photo BEFORE ${operation.toUpperCase()} ON product_catalog
      BEGIN SELECT RAISE(ABORT, 'catalog write failed'); END`);
      const action =
        operation === 'update'
          ? products.updateCatalogProduct(product.id, {
              ...metadata,
              imageUrl: next,
            })
          : products.deleteCatalogProduct(product.id);
      await expect(action).rejects.toThrow('catalog write failed');
      sqlite.reopen();
      setupDatabase();
      expect(await exists(pathFor(uri))).toBe(true);
      expect(nativeFiles.unlink).not.toHaveBeenCalled();
      expect(await products.findCatalogProductById(product.id)).toMatchObject({
        imageUrl: uri,
      });
      expect(
        await products.findDefinitionByEan(product.productEan!)
      ).toMatchObject({imageUrl: uri});
    }
  );

  it('keeps the photo when inventory blocks product deletion', async () => {
    const uri = await photo();
    const product = await createProduct('generic', uri);
    await products.addToInventory('copy', null, product.name, null, product.id);
    await expect(
      products.deleteCatalogProduct(product.id)
    ).rejects.toMatchObject({code: 'in_inventory'});
    expect(await exists(pathFor(uri))).toBe(true);
    expect(nativeFiles.unlink).not.toHaveBeenCalled();
  });

  it('keeps a committed update successful when unlink fails and retries cleanup later', async () => {
    const first = await photo();
    const product = await createProduct('generic', first);
    const second = await photo();
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
    nativeFiles.unlink.mockRejectedValueOnce(
      new Error('temporary storage error')
    );
    try {
      await expect(
        products.updateCatalogProduct(product.id, {
          ...metadata,
          imageUrl: second,
        })
      ).resolves.toMatchObject({imageUrl: second});
      expect(await exists(pathFor(first))).toBe(true);
      expect(await exists(pathFor(second))).toBe(true);
      expect(warning).toHaveBeenCalledTimes(1);
      await products.updateCatalogProduct(product.id, {...metadata});
      expect(await exists(pathFor(first))).toBe(false);
      expect(await exists(pathFor(second))).toBe(true);
    } finally {
      warning.mockRestore();
    }
  });

  it('keeps the file if references cannot be checked after commit', async () => {
    const first = await photo();
    const product = await createProduct('generic', first);
    const second = await photo();
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const execute = sqlite.execute.bind(sqlite);
    const failure = jest
      .spyOn(sqlite, 'execute')
      .mockImplementation((sql, params) => {
        if (sql.includes('UNION ALL SELECT 1 FROM product_definitions')) {
          throw new Error('reference read failed');
        }
        return execute(sql, params);
      });
    try {
      await expect(
        products.updateCatalogProduct(product.id, {
          ...metadata,
          imageUrl: second,
        })
      ).resolves.toMatchObject({imageUrl: second});
      expect(await exists(pathFor(first))).toBe(true);
      expect(nativeFiles.unlink).not.toHaveBeenCalled();
    } finally {
      failure.mockRestore();
      warning.mockRestore();
    }
    await cleanupUnusedProductPhotos([]);
    expect(await exists(pathFor(first))).toBe(false);
  });

  it.each([
    'source',
    'remote',
    'unrecognized filename',
    'path traversal',
  ] as const)('does not remove a %s image', async (kind) => {
    const external =
      kind === 'unrecognized filename'
        ? join(mockPhotoDirectory, 'product-photos', 'imported.jpg')
        : source;
    await mkdir(join(mockPhotoDirectory, 'product-photos'), {recursive: true});
    await writeFile(external, 'source');
    const uri =
      kind === 'remote'
        ? 'https://example.test/photo.jpg'
        : kind === 'path traversal'
        ? `file://${mockPhotoDirectory}/product-photos/../source.jpg`
        : `file://${external}`;
    const product = await createProduct('generic', uri);
    await products.updateCatalogProduct(product.id, {
      ...metadata,
      imageUrl: null,
    });
    await products.deleteCatalogProduct(product.id);
    expect(await exists(external)).toBe(true);
    expect(nativeFiles.unlink).not.toHaveBeenCalled();
  });

  it('defers cleanup while the photo belongs to an in-flight draft save', async () => {
    const {draft, uri} = await draftWithPhoto();
    const written = deferred();
    const finish = deferred();
    let productId = '';
    const save = draft.save(async () => {
      productId = (
        await products.saveGenericCatalogProduct({...metadata, imageUrl: uri})
      ).id;
      written.resolve();
      await finish.promise;
      return true;
    });
    try {
      await written.promise;
      const next = await photo();
      await products.updateCatalogProduct(productId, {
        ...metadata,
        imageUrl: next,
      });
      expect(await exists(pathFor(uri))).toBe(true);
      await draft.dispose();
      expect(await exists(pathFor(uri))).toBe(true);
      finish.resolve();
      await save;
      expect(await exists(pathFor(uri))).toBe(false);
      expect(await exists(pathFor(next))).toBe(true);
    } finally {
      finish.resolve();
      await save;
    }
  });

  it('preserves a photo referenced by a committed product even if the persistence callback throws', async () => {
    const {draft, uri} = await draftWithPhoto();
    let productId = '';
    await expect(
      draft.save(async () => {
        productId = (
          await products.saveGenericCatalogProduct({...metadata, imageUrl: uri})
        ).id;
        throw new Error('read after save failed');
      })
    ).rejects.toThrow('read after save failed');
    await draft.dispose();
    sqlite.reopen();
    setupDatabase();
    expect(await exists(pathFor(uri))).toBe(true);
    expect(await products.findCatalogProductById(productId)).toMatchObject({
      imageUrl: uri,
    });
    await products.deleteCatalogProduct(productId);
    expect(await exists(pathFor(uri))).toBe(false);
  });

  it('rechecks references if another product uses the photo while the filesystem check is pending', async () => {
    const first = await photo();
    const product = await createProduct('generic', first);
    const next = await photo();
    const started = deferred();
    const finish = deferred();
    nativeFiles.exists.mockImplementationOnce(async (path: string) => {
      started.resolve();
      await finish.promise;
      return exists(path);
    });
    const save = products.updateCatalogProduct(product.id, {
      ...metadata,
      imageUrl: next,
    });
    try {
      await started.promise;
      await products.saveGenericCatalogProduct({
        name: 'Inny produkt',
        imageUrl: first,
      });
      finish.resolve();
      await save;
      expect(await exists(pathFor(first))).toBe(true);
      expect(await exists(pathFor(next))).toBe(true);
    } finally {
      finish.resolve();
      await save;
    }
  });

  it('rejects storing a URI while its native unlink is already in progress', async () => {
    const first = await photo();
    const product = await createProduct('generic', first);
    const next = await photo();
    const started = deferred();
    const finish = deferred();
    nativeFiles.unlink.mockImplementationOnce(async (path: string) => {
      started.resolve();
      await finish.promise;
      await unlink(path);
    });
    const save = products.updateCatalogProduct(product.id, {
      ...metadata,
      imageUrl: next,
    });
    try {
      await started.promise;
      await expect(
        products.saveGenericCatalogProduct({
          name: 'Inny produkt',
          imageUrl: first,
        })
      ).rejects.toThrow('Product photo is being deleted');
      await expect(
        products.saveDefinition({
          ean: '5901111111111',
          name: 'Inny produkt',
          imageUrl: first,
        })
      ).rejects.toThrow('Product photo is being deleted');
      await expect(
        products.updateCatalogProduct(product.id, {
          ...metadata,
          imageUrl: first,
        })
      ).rejects.toThrow('Product photo is being deleted');
      await expect(
        products.saveGenericCatalogProduct({...metadata, imageUrl: first})
      ).resolves.toMatchObject({id: product.id, imageUrl: next});
      finish.resolve();
      await save;
      expect(
        await products.findCatalogProductByNormalizedName(
          'generic',
          'inny produkt'
        )
      ).toBeNull();
      expect(await exists(pathFor(first))).toBe(false);
      expect(await exists(pathFor(next))).toBe(true);
    } finally {
      finish.resolve();
      await save;
    }
  });
});
