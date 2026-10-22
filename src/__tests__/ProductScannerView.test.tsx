import React from 'react';
import {Text, TextInput} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {launchImageLibrary} from 'react-native-image-picker';
import {copyFile} from '@dr.pogodin/react-native-fs';
import {useCameraPermission} from 'react-native-vision-camera';
import ProductScannerView from '../ProductScannerView';
import {ProductRepository} from '../infrastructure/ProductRepository';

jest.mock('react-native-vision-camera', () => ({
  Camera: () => null,
  useCameraPermission: jest.fn(() => ({hasPermission: true, requestPermission: jest.fn()})),
  useCameraDevice: () => ({}),
  useCodeScanner: () => ({}),
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
  useAppToast: () => ({toast: null, toastAnim: {}, showToast: jest.fn()}),
}));
jest.mock('../shopping-lists/modals/DraggableBottomSheet', () => ({
  DraggableBottomSheet: ({visible, children}: {visible: boolean; children: React.ReactNode}) =>
    visible ? children : null,
}));

describe('UI: ProductScannerView manual products without EAN', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  const saveGeneric = jest.spyOn(ProductRepository.prototype, 'saveGenericCatalogProduct');
  const saveDefinition = jest.spyOn(ProductRepository.prototype, 'saveDefinition');
  const addToInventory = jest.spyOn(ProductRepository.prototype, 'addToInventory');
  const getCatalog = jest.spyOn(ProductRepository.prototype, 'getCatalogProducts');
  const onProductAdded = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useCameraPermission).mockReturnValue({hasPermission: true, requestPermission: jest.fn()});
    getCatalog.mockResolvedValue([]);
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
  });

  const press = async (label: string) => {
    const button = renderer!.root.findAll(node => typeof node.props.onPress === 'function').find(node =>
      node.findAllByType(Text).some(text => text.props.children === label),
    );
    expect(button).toBeDefined();
    await act(async () => { await button!.props.onPress(); });
  };

  const changeInput = async (placeholder: string, value: string) => {
    const input = renderer!.root.findAllByType(TextInput)
      .find(node => node.props.placeholder === placeholder);
    expect(input).toBeDefined();
    await act(() => input!.props.onChangeText(value));
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
});
