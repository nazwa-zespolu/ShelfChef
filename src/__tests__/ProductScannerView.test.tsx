import React from 'react';
import {Image, Text, TextInput} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {launchImageLibrary} from 'react-native-image-picker';
import {copyFile} from '@dr.pogodin/react-native-fs';
import {useCameraPermission, useCodeScanner} from 'react-native-vision-camera';
import ProductScannerView from '../ProductScannerView';
import {ProductRepository} from '../infrastructure/ProductRepository';
import {ScanToAdd} from '../app/ScanToAdd';
import {ProductDefinition} from '../domain/types';

const mockShowToast = jest.fn();

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return {promise, resolve, reject};
}

jest.mock('react-native-vision-camera', () => ({
  Camera: () => null,
  useCameraPermission: jest.fn(() => ({hasPermission: true, requestPermission: jest.fn()})),
  useCameraDevice: () => ({}),
  useCodeScanner: jest.fn(() => ({})),
}));
jest.mock('react-native-image-picker', () => ({launchImageLibrary: jest.fn()}));
jest.mock('@dr.pogodin/react-native-fs', () => ({
  DocumentDirectoryPath: '/documents',
  mkdir: jest.fn().mockResolvedValue(undefined),
  copyFile: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));
jest.mock('lucide-react-native', () => {
  const {View: MockIcon} = require('react-native');
  return {Camera: MockIcon, ImagePlus: MockIcon, Trash2: MockIcon, ArrowLeft: MockIcon, ChevronRight: MockIcon, Package: MockIcon, Search: MockIcon};
});
jest.mock('../components/AppToast', () => ({
  AppToast: () => null,
  useAppToast: () => ({toast: null, toastAnim: {}, showToast: mockShowToast}),
}));
jest.mock('../shopping-lists/modals/DraggableBottomSheet', () => ({
  DraggableBottomSheet: ({visible, children}: {visible: boolean; children: React.ReactNode}) =>
    visible ? children : null,
}));

describe('UI: ProductScannerView product adding', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  const saveGeneric = jest.spyOn(ProductRepository.prototype, 'saveGenericCatalogProduct');
  const saveDefinition = jest.spyOn(ProductRepository.prototype, 'saveDefinition');
  const addToInventory = jest.spyOn(ProductRepository.prototype, 'addToInventory');
  const getCatalog = jest.spyOn(ProductRepository.prototype, 'getCatalogProducts');
  const findDefinition = jest.spyOn(ProductRepository.prototype, 'findDefinitionByEan');
  const scan = jest.spyOn(ScanToAdd.prototype, 'execute');
  const onProductAdded = jest.fn();
  const existing: ProductDefinition = {
    ean: '5901234123457', name: 'Żurek', brand: 'Spichlerz', category: 'Zupy',
    imageUrl: 'file:///photos/soup.jpg',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useCameraPermission).mockReturnValue({hasPermission: true, requestPermission: jest.fn()});
    getCatalog.mockResolvedValue([]);
    findDefinition.mockReset().mockResolvedValue(null);
    saveDefinition.mockReset().mockResolvedValue();
    addToInventory.mockReset();
    scan.mockReset().mockResolvedValue({fallback: 'manual', ean: existing.ean});
    saveGeneric.mockResolvedValue({
      id: 'catalog-sauce',
      name: 'Domowy sos',
      normalizedName: 'domowy sos',
      kind: 'generic',
      productEan: null,
      brand: null,
      category: null,
      imageUrl: null,
      parentCatalogProductId: null,
      createdAt: '2026-10-22T10:00:00.000Z',
      updatedAt: '2026-10-22T10:00:00.000Z',
    });
    addToInventory.mockResolvedValue();
  });

  afterEach(async () => {
    await act(() => renderer?.unmount());
    renderer = undefined;
  });

  afterAll(() => {
    saveGeneric.mockRestore();
    saveDefinition.mockRestore();
    addToInventory.mockRestore();
    getCatalog.mockRestore();
    findDefinition.mockRestore();
    scan.mockRestore();
  });

  const button = (label: string) => {
    const match = renderer!.root.findAll(node => typeof node.props.onPress === 'function').find(node =>
      node.findAllByType(Text).some(text => text.props.children === label),
    );
    expect(match).toBeDefined();
    return match!;
  };

  const press = async (label: string) => {
    await act(async () => { await button(label).props.onPress(); });
  };

  const input = (placeholder: string) => renderer!.root.findAllByType(TextInput)
    .find(node => node.props.placeholder === placeholder)!;

  const expectSharedFields = (product: {name: string; brand?: string; category?: string}, editable: boolean) => {
    for (const [placeholder, value] of [
      ['Np. Domowy zakwas', product.name], ['Np. Barilla', product.brand ?? ''],
      ['Np. Produkty suche', product.category ?? ''],
    ]) {
      expect(input(placeholder).props.value).toBe(value);
      expect(input(placeholder).props.editable).toBe(editable);
    }
  };

  const changeInput = async (placeholder: string, value: string) => {
    const field = input(placeholder);
    expect(field).toBeDefined();
    await act(async () => { field.props.onChangeText(value); });
  };

  const openForm = async () => {
    await act(() => {
      renderer = ReactTestRenderer.create(<ProductScannerView onProductAdded={onProductAdded} />);
    });
    await press('Dodaj ręcznie');
    await changeInput('Np. Domowy zakwas', '  Domowy sos  ');
  };

  it('passes the brand, category and stored photo to the catalog when adding an inventory item', async () => {
    jest.mocked(launchImageLibrary).mockResolvedValue({assets: [{uri: 'file:///temporary/sauce.jpg'}]});
    await openForm();
    await changeInput('Np. Barilla', '  Spichlerz  ');
    await changeInput('Np. Produkty suche', '  Przetwory warzywne  ');
    await press('Galeria');
    const photoDestination = jest.mocked(copyFile).mock.calls[0][1];

    await press('Zapisz i dodaj');

    expect(saveGeneric).toHaveBeenCalledWith({
      name: 'Domowy sos',
      brand: 'Spichlerz',
      category: 'Przetwory warzywne',
      imageUrl: `file://${photoDestination}`,
    });
    expect(addToInventory).toHaveBeenCalledWith(expect.any(String), null, 'Domowy sos', null, 'catalog-sauce');
    expect(saveDefinition).not.toHaveBeenCalled();
    expect(onProductAdded).toHaveBeenCalledTimes(1);
  });

  it('allows saving without a brand, category or photo', async () => {
    await openForm();
    await changeInput('Np. Barilla', '  ');
    await changeInput('Np. Produkty suche', '  ');

    await press('Zapisz i dodaj');

    expect(saveGeneric).toHaveBeenCalledWith({
      name: 'Domowy sos',
      brand: undefined,
      category: undefined,
      imageUrl: null,
    });
    expect(addToInventory).toHaveBeenCalledTimes(1);
    expect(onProductAdded).toHaveBeenCalledTimes(1);
  });

  it('opens the catalog without camera permission and returns to the scanner screen', async () => {
    jest.mocked(useCameraPermission).mockReturnValue({hasPermission: false, requestPermission: jest.fn()});
    await act(() => { renderer = ReactTestRenderer.create(<ProductScannerView />); });

    await press('Katalog produktów');

    expect(getCatalog).toHaveBeenCalledTimes(1);
    expect(renderer!.root.findAllByType(Text).map(node => node.props.children)).toContain('Katalog jest pusty');
    await act(() => renderer!.root.findByProps({testID: 'catalog-back'}).props.onPress());
    expect(renderer!.root.findAllByType(Text).map(node => node.props.children)).toContain('Brak zgody na użycie aparatu.');
  });

  it('loads and locks shared metadata and photo while allowing quantities and expiry for new copies', async () => {
    findDefinition.mockResolvedValue(existing);
    await openForm();
    await changeInput('Np. 5901234123457', existing.ean);

    expectSharedFields(existing, false);
    expect(input('Np. 5901234123457').props.editable).toBe(true);
    expect(renderer!.root.findAllByType(Image).some(image => image.props.source.uri === existing.imageUrl)).toBe(true);
    expect(button('Galeria').props.disabled).toBe(true);
    expect(button('Aparat').props.disabled).toBe(true);
    expect(button('Usuń zdjęcie').props.disabled).toBe(true);
    await press('+');
    await press('Ustaw datę');
    await press('Zapisz i dodaj');

    expect(saveDefinition).not.toHaveBeenCalled();
    expect(saveGeneric).not.toHaveBeenCalled();
    expect(addToInventory).toHaveBeenCalledTimes(2);
    expect(addToInventory).toHaveBeenNthCalledWith(1, expect.any(String), existing.ean, null, expect.any(String));
    expect(addToInventory).toHaveBeenNthCalledWith(2, expect.any(String), existing.ean, null, expect.any(String));
    expect(onProductAdded).toHaveBeenCalledTimes(1);
  });

  it('adds a known EAN without requiring a manually entered name and keeps missing metadata empty', async () => {
    findDefinition.mockResolvedValue({ean: existing.ean, name: existing.name});
    await act(async () => { renderer = ReactTestRenderer.create(<ProductScannerView onProductAdded={onProductAdded} />); });
    await press('Dodaj ręcznie');
    await changeInput('Np. Barilla', 'Draft brand');
    await changeInput('Np. Produkty suche', 'Draft category');
    await changeInput('Np. 5901234123457', existing.ean);

    expectSharedFields({name: existing.name}, false);
    await press('Zapisz i dodaj');

    expect(addToInventory).toHaveBeenCalledWith(expect.any(String), existing.ean, null, null);
    expect(saveDefinition).not.toHaveBeenCalled();
    expect(onProductAdded).toHaveBeenCalledTimes(1);
  });

  it.each(['', '123', '5901234123464'])(
    'restores the manual draft and photo when a known EAN changes to "%s"',
    async nextEan => {
      findDefinition.mockImplementation(async ean => ean === existing.ean ? existing : null);
      jest.mocked(launchImageLibrary).mockResolvedValue({assets: [{uri: 'file:///temporary/draft.jpg'}]});
      await openForm();
      await changeInput('Np. Barilla', 'Draft brand');
      await changeInput('Np. Produkty suche', 'Draft category');
      await press('Galeria');
      const draftImage = `file://${jest.mocked(copyFile).mock.calls[0][1]}`;
      await changeInput('Np. 5901234123457', existing.ean);
      await changeInput('Np. 5901234123457', nextEan);

      expectSharedFields({name: '  Domowy sos  ', brand: 'Draft brand', category: 'Draft category'}, true);
      expect(button('Galeria').props.disabled).toBe(false);
      expect(renderer!.root.findAllByType(Image).some(image => image.props.source.uri === draftImage)).toBe(true);
      if (!nextEan) {
        await press('Zapisz i dodaj');
        expect(saveGeneric).toHaveBeenCalledWith({
          name: 'Domowy sos', brand: 'Draft brand', category: 'Draft category', imageUrl: draftImage,
        });
        expect(addToInventory).toHaveBeenCalledWith(expect.any(String), null, 'Domowy sos', null, 'catalog-sauce');
      }
    },
  );

  it.each(['success', 'error'])(
    'ignores a late lookup %s after switching to another EAN',
    async outcome => {
      const first = deferred<ProductDefinition | null>();
      const second = {...existing, ean: '5901234123464', name: 'Inny produkt'};
      findDefinition.mockImplementation(ean => ean === existing.ean ? first.promise : Promise.resolve(second));
      await openForm();
      await changeInput('Np. 5901234123457', existing.ean);
      expect(button('Zapisz i dodaj').props.disabled).toBe(true);
      await press('Zapisz i dodaj');
      expect(addToInventory).not.toHaveBeenCalled();
      await changeInput('Np. 5901234123457', second.ean);
      expectSharedFields(second, false);

      await act(async () => {
        if (outcome === 'success') { first.resolve(existing); }
        else { first.reject(new Error('stale lookup failed')); }
      });

      expectSharedFields(second, false);
      expect(button('Zapisz i dodaj').props.disabled).toBe(false);
      await press('Zapisz i dodaj');
      expect(addToInventory).toHaveBeenCalledWith(expect.any(String), second.ean, null, null);
    },
  );

  it.each(['clear', 'close'])(
    'ignores a pending lookup after %s and keeps the current form editable',
    async action => {
      const pending = deferred<ProductDefinition | null>();
      findDefinition.mockReturnValue(pending.promise);
      await openForm();
      await changeInput('Np. 5901234123457', existing.ean);
      if (action === 'clear') {
        await changeInput('Np. 5901234123457', '');
      } else {
        await press('Zamknij');
        await press('Dodaj ręcznie');
      }
      await act(async () => { pending.resolve(existing); });

      expectSharedFields({name: action === 'clear' ? '  Domowy sos  ' : ''}, true);
      expect(button('Zapisz i dodaj').props.disabled).toBe(false);
      expect(input('Np. 5901234123457').props.value).toBe('');
    },
  );

  it('blocks saving after a failed EAN lookup and allows retry without losing the draft', async () => {
    findDefinition.mockRejectedValueOnce(new Error('read failed')).mockResolvedValue(existing);
    await openForm();
    await changeInput('Np. 5901234123457', existing.ean);

    expect(button('Zapisz i dodaj').props.disabled).toBe(true);
    await press('Zapisz i dodaj');
    expect(saveDefinition).not.toHaveBeenCalled();
    expect(addToInventory).not.toHaveBeenCalled();
    await press('Ponów sprawdzenie EAN');
    expectSharedFields(existing, false);
    await changeInput('Np. 5901234123457', '');
    expectSharedFields({name: '  Domowy sos  '}, true);
  });

  it('does not restart or block a completed lookup when only EAN whitespace changes', async () => {
    findDefinition.mockResolvedValue(existing);
    await openForm();
    await changeInput('Np. 5901234123457', existing.ean);
    await changeInput('Np. 5901234123457', ` ${existing.ean} `);

    expect(findDefinition).toHaveBeenCalledTimes(1);
    expectSharedFields(existing, false);
    expect(button('Zapisz i dodaj').props.disabled).toBe(false);
  });

  it('saves metadata for an unknown EAN and adds a copy of the persisted definition', async () => {
    const saved = {...existing, name: 'Domowy sos', brand: 'Draft brand', category: 'Draft category', imageUrl: undefined};
    saveDefinition.mockImplementation(async () => { findDefinition.mockResolvedValue(saved); });
    await openForm();
    await changeInput('Np. Barilla', '  Draft brand  ');
    await changeInput('Np. Produkty suche', '  Draft category  ');
    await changeInput('Np. 5901234123457', existing.ean);
    expect(input('Np. Domowy zakwas').props.editable).toBe(true);
    await press('Zapisz i dodaj');

    expect(saveDefinition).toHaveBeenCalledWith(saved);
    expect(addToInventory).toHaveBeenCalledWith(expect.any(String), existing.ean, null, null);
    expect(saveGeneric).not.toHaveBeenCalled();
    expect(onProductAdded).toHaveBeenCalledTimes(1);
  });

  it('uses a product created after the lookup instead of saving stale draft metadata', async () => {
    await openForm();
    await changeInput('Np. 5901234123457', existing.ean);
    findDefinition.mockResolvedValue(existing);
    await press('Zapisz i dodaj');

    expect(saveDefinition).not.toHaveBeenCalled();
    expect(addToInventory).toHaveBeenCalledWith(expect.any(String), existing.ean, null, null);
    expect(mockShowToast).toHaveBeenLastCalledWith(expect.stringContaining(existing.name));
  });

  it('guards duplicate saves and dismissal during an inventory write', async () => {
    const pending = deferred<void>();
    findDefinition.mockResolvedValue(existing);
    addToInventory.mockReturnValue(pending.promise);
    await openForm();
    await changeInput('Np. 5901234123457', existing.ean);
    const save = button('Zapisz i dodaj').props.onPress;
    await act(async () => { save(); save(); });

    expect(addToInventory).toHaveBeenCalledTimes(1);
    expect(input('Np. 5901234123457').props.editable).toBe(false);
    await press('Zamknij');
    expect(input('Np. 5901234123457')).toBeDefined();
    await act(async () => { pending.resolve(); });
    expect(onProductAdded).toHaveBeenCalledTimes(1);
    expect(renderer!.root.findAllByType(TextInput)).toHaveLength(0);
  });

  it('preserves the form after a failed write and allows retry', async () => {
    findDefinition.mockResolvedValue(existing);
    addToInventory.mockRejectedValueOnce(new Error('write failed')).mockResolvedValue(undefined);
    await openForm();
    await changeInput('Np. 5901234123457', existing.ean);
    await press('Zapisz i dodaj');

    expectSharedFields(existing, false);
    expect(input('Np. 5901234123457').props.editable).toBe(true);
    expect(mockShowToast).toHaveBeenLastCalledWith('Nie udało się dodać produktu', 'error');
    expect(onProductAdded).not.toHaveBeenCalled();
    await press('Zapisz i dodaj');
    expect(addToInventory).toHaveBeenCalledTimes(2);
    expect(saveDefinition).not.toHaveBeenCalled();
    expect(onProductAdded).toHaveBeenCalledTimes(1);
  });

  it('preserves new product metadata after a definition write fails and retries the save', async () => {
    saveDefinition.mockRejectedValueOnce(new Error('definition write failed'));
    await openForm();
    await changeInput('Np. Barilla', 'Draft brand');
    await changeInput('Np. 5901234123457', existing.ean);
    await press('Zapisz i dodaj');

    expectSharedFields({name: '  Domowy sos  ', brand: 'Draft brand'}, true);
    expect(button('Zapisz i dodaj').props.disabled).toBe(false);
    expect(addToInventory).not.toHaveBeenCalled();
    expect(onProductAdded).not.toHaveBeenCalled();
    saveDefinition.mockImplementation(async () => {
      findDefinition.mockResolvedValue({...existing, name: 'Domowy sos', brand: 'Draft brand'});
    });
    await press('Zapisz i dodaj');

    expect(saveDefinition).toHaveBeenCalledTimes(2);
    expect(addToInventory).toHaveBeenCalledTimes(1);
    expect(onProductAdded).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid EAN without querying or writing a definition', async () => {
    await openForm();
    await changeInput('Np. 5901234123457', '5901234123458');
    await press('Zapisz i dodaj');

    expect(findDefinition).not.toHaveBeenCalled();
    expect(saveDefinition).not.toHaveBeenCalled();
    expect(saveGeneric).not.toHaveBeenCalled();
    expect(addToInventory).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenLastCalledWith('Popraw EAN albo zostaw to pole puste', 'error');
  });

  it('locks local metadata in the scanned manual fallback when the product has appeared locally', async () => {
    findDefinition.mockResolvedValue(existing);
    await act(async () => { renderer = ReactTestRenderer.create(<ProductScannerView onProductAdded={onProductAdded} />); });
    const scanner = jest.mocked(useCodeScanner).mock.calls.slice(-1)[0][0];
    await act(async () => { scanner.onCodeScanned([{type: 'ean-13', value: existing.ean}], {width: 100, height: 100}); });

    expect(scan).toHaveBeenCalledWith({ean: existing.ean});
    const fields = renderer!.root.findAllByType(TextInput);
    expect(fields.map(field => field.props.value)).toEqual([existing.ean, existing.name, existing.brand, existing.category]);
    expect(fields.every(field => field.props.editable === false)).toBe(true);
    await press('Zapisz i dodaj');
    expect(saveDefinition).not.toHaveBeenCalled();
    expect(addToInventory).toHaveBeenCalledWith(expect.any(String), existing.ean, null, null);
  });
});
