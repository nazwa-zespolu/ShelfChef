import React from 'react';
import {Alert, BackHandler, FlatList, Image, Linking, PermissionsAndroid, Platform, Text, TextInput} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {launchCamera, launchImageLibrary} from 'react-native-image-picker';
import {copyFile, mkdir, unlink} from '@dr.pogodin/react-native-fs';
import ProductCatalogView from '../ProductCatalogView';
import {CatalogProductEditModal} from '../components/CatalogProductEditModal';
import type {CatalogProduct} from '../domain/types';
import {CatalogProductDeleteError, CatalogProductUpdateError, ProductRepository} from '../infrastructure/ProductRepository';

jest.mock('react-native-image-picker', () => ({launchCamera: jest.fn(), launchImageLibrary: jest.fn()}));
jest.mock('@dr.pogodin/react-native-fs', () => ({
  DocumentDirectoryPath: '/documents', mkdir: jest.fn(), copyFile: jest.fn(),
  exists: jest.fn().mockResolvedValue(true), unlink: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));
jest.mock('lucide-react-native', () => {
  const {View: MockIcon} = require('react-native');
  return {ArrowLeft: MockIcon, ChevronRight: MockIcon, Package: MockIcon, Search: MockIcon};
});
jest.mock('../shopping-lists/modals/DraggableBottomSheet', () => ({
  DraggableBottomSheet: ({visible, children}: {visible: boolean; children: React.ReactNode}) => visible ? children : null,
}));

const generic: CatalogProduct = {
  id: 'generic-soup', name: 'Żurek', normalizedName: 'żurek', kind: 'generic', productEan: null,
  brand: 'Domowa kuchnia', category: 'Zupy', imageUrl: 'file:///photos/soup.jpg',
  parentCatalogProductId: null, createdAt: '2026-10-22T10:00:00.000Z', updatedAt: '2026-10-22T10:00:00.000Z',
};
const specific: CatalogProduct = {...generic, id: 'specific-soup', kind: 'specific', productEan: '5901234123457'};
const edited: CatalogProduct = {...generic, name: 'Żurek domowy', normalizedName: 'żurek domowy', brand: null, category: 'Dania gotowe'};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return {promise, resolve, reject};
}

describe('UI: ProductCatalogView', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  const getCatalog = jest.spyOn(ProductRepository.prototype, 'getCatalogProducts');
  const searchCatalog = jest.spyOn(ProductRepository.prototype, 'searchCatalogProducts');
  const findProduct = jest.spyOn(ProductRepository.prototype, 'findCatalogProductById');
  const updateProduct = jest.spyOn(ProductRepository.prototype, 'updateCatalogProduct');
  const deleteProduct = jest.spyOn(ProductRepository.prototype, 'deleteCatalogProduct');
  const alert = jest.spyOn(Alert, 'alert');
  const backHandler = jest.spyOn(BackHandler, 'addEventListener');
  const consoleError = jest.spyOn(console, 'error');
  const onRequestClose = jest.fn();
  const onProductUpdated = jest.fn();
  const checkCameraPermission = jest.spyOn(PermissionsAndroid, 'check');
  const requestCameraPermission = jest.spyOn(PermissionsAndroid, 'request');
  const openSettings = jest.spyOn(Linking, 'openSettings');
  let restorePlatform: () => void;

  beforeEach(() => {
    const replacement = jest.replaceProperty(Platform, 'OS', 'android');
    restorePlatform = () => replacement.restore();
    checkCameraPermission.mockReset().mockResolvedValue(true);
    requestCameraPermission.mockReset().mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
    openSettings.mockReset().mockResolvedValue();
    jest.mocked(launchCamera).mockReset().mockResolvedValue({didCancel: true});
    jest.mocked(launchImageLibrary).mockReset().mockResolvedValue({didCancel: true});
    jest.mocked(mkdir).mockReset().mockResolvedValue(undefined);
    jest.mocked(copyFile).mockReset().mockResolvedValue(undefined);
    jest.mocked(unlink).mockReset().mockResolvedValue(undefined);
    getCatalog.mockReset().mockResolvedValue([generic, specific]);
    searchCatalog.mockReset().mockResolvedValue([specific]);
    findProduct.mockReset().mockImplementation(async id => [generic, specific].find(product => product.id === id) ?? null);
    updateProduct.mockReset().mockResolvedValue(edited);
    deleteProduct.mockReset().mockResolvedValue();
    alert.mockReset();
    backHandler.mockClear();
    consoleError.mockClear();
    onRequestClose.mockClear();
    onProductUpdated.mockClear();
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
    restorePlatform();
    expect(consoleError).not.toHaveBeenCalled();
  });

  afterAll(() => {
    getCatalog.mockRestore();
    searchCatalog.mockRestore();
    findProduct.mockRestore();
    updateProduct.mockRestore();
    deleteProduct.mockRestore();
    alert.mockRestore();
    backHandler.mockRestore();
    consoleError.mockRestore();
    checkCameraPermission.mockRestore();
    requestCameraPermission.mockRestore();
    openSettings.mockRestore();
  });

  const renderCatalog = async () => {
    await act(async () => {
      renderer = ReactTestRenderer.create(<ProductCatalogView onRequestClose={onRequestClose} onProductUpdated={onProductUpdated} />);
    });
  };
  const press = async (testID: string) => {
    await act(async () => { await renderer!.root.findByProps({testID}).props.onPress(); });
  };
  const change = async (testID: string, value: string) => {
    await act(async () => renderer!.root.findByProps({testID}).props.onChangeText(value));
  };
  const displayedProducts = () => renderer!.root.findByType(FlatList).props.data as CatalogProduct[];
  const texts = () => renderer!.root.findAllByType(Text).map(node => node.props.children);
  const photoPreview = () => renderer!.root.findByType(CatalogProductEditModal).findAllByType(Image)[0]?.props.source.uri;
  const hardwareBack = async () => {
    const handler = backHandler.mock.calls.at(-1)?.[1];
    expect(handler).toBeDefined();
    await act(async () => { expect(handler!()).toBe(true); });
  };
  const deleteConfirmation = () => {
    const button = alert.mock.calls.at(-1)?.[2]?.find(action => action.style === 'destructive');
    expect(button?.onPress).toBeDefined();
    return button!.onPress!;
  };
  const confirmDelete = async () => {
    await act(async () => { deleteConfirmation()(); });
  };

  it.each([generic, specific])('deletes the $kind product only after confirmation and refreshes the active search', async product => {
    searchCatalog.mockResolvedValueOnce([product]).mockResolvedValueOnce([]);
    await renderCatalog();
    await change('catalog-search', 'żurek');
    await press(`catalog-product-${product.id}`);
    await change('catalog-edit-name', 'Niezapisana nazwa');
    await press('catalog-edit-delete');

    expect(alert).toHaveBeenCalledWith('Usunąć produkt?', expect.stringContaining(product.name), expect.any(Array), expect.any(Object));
    expect(deleteProduct).not.toHaveBeenCalled();
    await confirmDelete();

    expect(deleteProduct).toHaveBeenCalledWith(product.id);
    expect(updateProduct).not.toHaveBeenCalled();
    expect(onProductUpdated).toHaveBeenCalledTimes(1);
    expect(displayedProducts()).toEqual([]);
    expect(renderer!.root.findByProps({testID: 'catalog-search'}).props.value).toBe('żurek');
    expect(renderer!.root.findByType(CatalogProductEditModal).props.product).toBeNull();
    expect(texts()).toContain('Usunięto produkt z katalogu.');
  });

  it.each(['cancel', 'dismiss'] as const)('preserves the draft after confirmation %s and allows requesting deletion again', async action => {
    await renderCatalog();
    await press(`catalog-product-${generic.id}`);
    await change('catalog-edit-name', 'Szkic nazwy');
    await press('catalog-edit-delete');
    await press('catalog-edit-delete');
    expect(alert).toHaveBeenCalledTimes(1);
    const oldConfirm = deleteConfirmation();

    await act(async () => {
      if (action === 'cancel') { alert.mock.calls[0][2]!.find(button => button.style === 'cancel')!.onPress!(); }
      else { alert.mock.calls[0][3]!.onDismiss!(); }
      oldConfirm();
    });

    expect(deleteProduct).not.toHaveBeenCalled();
    expect(renderer!.root.findByProps({testID: 'catalog-edit-name'}).props.value).toBe('Szkic nazwy');
    expect(photoPreview()).toBe(generic.imageUrl);
    await press('catalog-edit-delete');
    expect(alert).toHaveBeenCalledTimes(2);
  });

  it.each([
    [new CatalogProductDeleteError('in_inventory', 'In use'), 'Produkt ma egzemplarze w spiżarni. Aby go usunąć z katalogu, najpierw usuń te egzemplarze.'],
    [new CatalogProductDeleteError('in_shopping_list', 'In use'), 'Produkt jest powiązany z listą zakupową. Najpierw usuń pozycję lub jej powiązanie z produktem.'],
    [new CatalogProductDeleteError('has_children', 'In use'), 'Nie można usunąć produktu, z którym są powiązane inne produkty w katalogu.'],
    [new Error('Database unavailable'), 'Nie udało się usunąć produktu. Spróbuj ponownie.'],
  ])('explains a deletion failure without closing or saving the draft: %s', async (error, message) => {
    deleteProduct.mockRejectedValueOnce(error);
    await renderCatalog();
    await press(`catalog-product-${generic.id}`);
    await change('catalog-edit-brand', 'Szkic marki');
    await press('catalog-edit-delete');
    await confirmDelete();

    expect(texts()).toContain(message);
    expect(renderer!.root.findByProps({testID: 'catalog-edit-brand'}).props.value).toBe('Szkic marki');
    expect(photoPreview()).toBe(generic.imageUrl);
    expect(updateProduct).not.toHaveBeenCalled();
    expect(onProductUpdated).not.toHaveBeenCalled();
    expect(renderer!.root.findByProps({testID: 'catalog-edit-delete'}).props.disabled).toBe(false);
  });

  it('preserves a photo draft after deletion fails and cleans it after a successful retry', async () => {
    deleteProduct.mockRejectedValueOnce(new Error('Database unavailable'));
    jest.mocked(launchImageLibrary).mockResolvedValue({assets: [{uri: 'file:///temporary/new.jpg'}]});
    await renderCatalog();
    await press(`catalog-product-${generic.id}`);
    await press('catalog-edit-photo-library');
    const draftPhoto = photoPreview();
    await press('catalog-edit-delete');
    await confirmDelete();

    expect(photoPreview()).toBe(draftPhoto);
    expect(unlink).not.toHaveBeenCalled();
    await press('catalog-edit-delete');
    await confirmDelete();

    expect(deleteProduct).toHaveBeenCalledTimes(2);
    expect(unlink).toHaveBeenCalledWith(draftPhoto.slice('file://'.length));
    expect(unlink).not.toHaveBeenCalledWith(generic.imageUrl!.slice('file://'.length));
    expect(onProductUpdated).toHaveBeenCalledTimes(1);
  });

  it('blocks duplicate deletion, saving, photo selection and dismissal while deletion is pending', async () => {
    const pending = deferred<void>();
    deleteProduct.mockReturnValueOnce(pending.promise);
    await renderCatalog();
    await press(`catalog-product-${generic.id}`);
    await press('catalog-edit-delete');
    const confirm = deleteConfirmation();
    await act(async () => { confirm(); confirm(); });
    await press('catalog-edit-delete');
    await press('catalog-edit-save');
    await press('catalog-edit-photo-camera');
    await press('catalog-edit-cancel');
    await hardwareBack();

    expect(deleteProduct).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledTimes(1);
    expect(updateProduct).not.toHaveBeenCalled();
    expect(launchCamera).not.toHaveBeenCalled();
    expect(onRequestClose).not.toHaveBeenCalled();
    expect(renderer!.root.findByProps({testID: 'catalog-edit-name'}).props.editable).toBe(false);
    expect(renderer!.root.findByProps({testID: 'catalog-edit-delete'}).props.disabled).toBe(true);
    expect(texts()).toContain('Usuwam…');
    await act(async () => pending.resolve());
    expect(onProductUpdated).toHaveBeenCalledTimes(1);
  });

  it('ignores an old deletion confirmation after closing the editor and selecting another product', async () => {
    await renderCatalog();
    await press(`catalog-product-${generic.id}`);
    await press('catalog-edit-delete');
    const oldConfirm = deleteConfirmation();
    await press('catalog-edit-cancel');
    await press(`catalog-product-${specific.id}`);
    await act(async () => { oldConfirm(); });

    expect(deleteProduct).not.toHaveBeenCalled();
    expect(renderer!.root.findByType(CatalogProductEditModal).props.product).toEqual(specific);
  });

  it('refreshes the catalog if the deleted product no longer exists while preserving the editor draft', async () => {
    deleteProduct.mockRejectedValueOnce(new CatalogProductDeleteError('not_found', 'Missing'));
    getCatalog.mockResolvedValueOnce([generic]).mockResolvedValueOnce([]);
    await renderCatalog();
    await press(`catalog-product-${generic.id}`);
    await change('catalog-edit-name', 'Szkic nazwy');
    await press('catalog-edit-delete');
    await confirmDelete();

    expect(texts()).toContain('Ten produkt nie jest już dostępny w katalogu. Zamknij edycję.');
    expect(displayedProducts()).toEqual([]);
    expect(renderer!.root.findByProps({testID: 'catalog-edit-name'}).props.value).toBe('Szkic nazwy');
    expect(onProductUpdated).not.toHaveBeenCalled();
  });

  it('reports a refresh failure separately after deletion and retries loading without deleting again', async () => {
    getCatalog.mockResolvedValueOnce([generic]).mockRejectedValueOnce(new Error('Refresh failed')).mockResolvedValueOnce([]);
    await renderCatalog();
    await press(`catalog-product-${generic.id}`);
    await press('catalog-edit-delete');
    await confirmDelete();

    expect(texts()).toContain('Usunięto produkt z katalogu.');
    expect(texts()).toContain('Nie udało się wczytać katalogu. Spróbuj ponownie.');
    expect(renderer!.root.findByType(CatalogProductEditModal).props.product).toBeNull();
    await press('catalog-retry');
    expect(displayedProducts()).toEqual([]);
    expect(deleteProduct).toHaveBeenCalledTimes(1);
  });

  it.each(['success', 'failure'] as const)('ignores deletion %s after the catalog is unmounted', async outcome => {
    const pending = deferred<void>();
    deleteProduct.mockReturnValueOnce(pending.promise);
    await renderCatalog();
    await press(`catalog-product-${generic.id}`);
    await press('catalog-edit-delete');
    await confirmDelete();
    await act(async () => { renderer!.unmount(); });
    renderer = undefined;
    await act(async () => {
      if (outcome === 'success') { pending.resolve(); }
      else { pending.reject(new Error('Delete failed')); }
    });

    expect(onProductUpdated).not.toHaveBeenCalled();
    expect(deleteProduct).toHaveBeenCalledTimes(1);
  });

  it('loads all local products, searches by name or EAN and restores the list when the query is cleared', async () => {
    await renderCatalog();
    expect(displayedProducts()).toEqual([generic, specific]);

    await change('catalog-search', '590123');
    expect(searchCatalog).toHaveBeenCalledWith('590123');
    expect(displayedProducts()).toEqual([specific]);
    await change('catalog-search', '  ');

    expect(displayedProducts()).toEqual([generic, specific]);
    expect(getCatalog).toHaveBeenCalledTimes(2);
  });

  it.each([generic, specific])('opens $kind data with shared-change information and a read-only EAN', async product => {
    await renderCatalog();
    await press(`catalog-product-${product.id}`);

    expect(findProduct).toHaveBeenCalledWith(product.id);
    expect(renderer!.root.findByProps({testID: 'catalog-edit-name'}).props.value).toBe(product.name);
    expect(renderer!.root.findByProps({testID: 'catalog-edit-brand'}).props.value).toBe(product.brand);
    expect(renderer!.root.findByProps({testID: 'catalog-edit-category'}).props.value).toBe(product.category);
    expect(texts()).toContain('Zmiany dotyczą wszystkich egzemplarzy tego produktu');
    expect(texts()).toContain(product.productEan ? `EAN: ${product.productEan}` : 'Produkt bez EAN');
    expect(renderer!.root.findByType(CatalogProductEditModal).findAllByType(TextInput)).toHaveLength(3);
    expect(renderer!.root.findByType(CatalogProductEditModal).findByType(Image).props.source.uri).toBe(product.imageUrl);
  });

  it('discards cancelled drafts and restores stored fields when reopened', async () => {
    await renderCatalog();
    await press(`catalog-product-${generic.id}`);
    await change('catalog-edit-name', 'Niezapisana nazwa');
    await change('catalog-edit-brand', 'Niezapisana marka');
    await press('catalog-edit-cancel');
    await press(`catalog-product-${generic.id}`);

    expect(updateProduct).not.toHaveBeenCalled();
    expect(renderer!.root.findByProps({testID: 'catalog-edit-name'}).props.value).toBe(generic.name);
    expect(renderer!.root.findByProps({testID: 'catalog-edit-brand'}).props.value).toBe(generic.brand);
  });

  it('saves only trimmed shared fields, clears optional values and refreshes the active search', async () => {
    searchCatalog.mockResolvedValueOnce([generic]).mockResolvedValueOnce([]);
    await renderCatalog();
    await change('catalog-search', 'żurek');
    await press(`catalog-product-${generic.id}`);
    await change('catalog-edit-name', '  Barszcz  ');
    await change('catalog-edit-brand', '  ');
    await change('catalog-edit-category', '  Dania gotowe  ');

    await press('catalog-edit-save');

    expect(updateProduct).toHaveBeenCalledWith(generic.id, {name: 'Barszcz', brand: null, category: 'Dania gotowe'});
    expect(onProductUpdated).toHaveBeenCalledTimes(1);
    expect(renderer!.root.findByType(CatalogProductEditModal).props.product).toBeNull();
    expect(displayedProducts()).toEqual([]);
    expect(renderer!.root.findByProps({testID: 'catalog-search'}).props.value).toBe('żurek');
    expect(texts()).toContain('Zapisano zmiany produktu.');
  });

  it('rejects an empty draft name before calling the repository', async () => {
    await renderCatalog();
    await press(`catalog-product-${generic.id}`);
    await change('catalog-edit-name', '   ');

    expect(renderer!.root.findByProps({testID: 'catalog-edit-save'}).props.disabled).toBe(true);
    await press('catalog-edit-save');

    expect(updateProduct).not.toHaveBeenCalled();
  });

  it.each([
    [new CatalogProductUpdateError('duplicate_name', 'Duplicate'), 'Produkt bez EAN o tej nazwie już istnieje. Wybierz inną nazwę.'],
    [new Error('Database unavailable'), 'Nie udało się zapisać zmian. Spróbuj ponownie.'],
  ])('preserves the draft after a save error and allows correcting it and retrying: %s', async (error, message) => {
    updateProduct.mockRejectedValueOnce(error).mockResolvedValueOnce(edited);
    await renderCatalog();
    await press(`catalog-product-${generic.id}`);
    await change('catalog-edit-name', 'Żurek domowy');

    await press('catalog-edit-save');

    expect(texts()).toContain(message);
    expect(renderer!.root.findByProps({testID: 'catalog-edit-name'}).props.value).toBe('Żurek domowy');
    expect(onProductUpdated).not.toHaveBeenCalled();
    await change('catalog-edit-name', 'Inna zupa');
    expect(texts()).not.toContain(message);
    await press('catalog-edit-save');
    expect(updateProduct).toHaveBeenCalledTimes(2);
    expect(onProductUpdated).toHaveBeenCalledTimes(1);
  });

  it('refreshes the catalog after a missing-product error while keeping the draft until cancelled', async () => {
    getCatalog.mockResolvedValueOnce([generic]).mockResolvedValueOnce([]);
    updateProduct.mockRejectedValueOnce(new CatalogProductUpdateError('not_found', 'Missing'));
    await renderCatalog();
    await press(`catalog-product-${generic.id}`);
    await change('catalog-edit-name', 'Żurek domowy');

    await press('catalog-edit-save');

    expect(texts()).toContain('Ten produkt nie jest już dostępny w katalogu. Zamknij edycję.');
    expect(renderer!.root.findByProps({testID: 'catalog-edit-name'}).props.value).toBe('Żurek domowy');
    expect(onProductUpdated).not.toHaveBeenCalled();
    await press('catalog-edit-cancel');
    expect(displayedProducts()).toEqual([]);
  });

  it('blocks duplicate saves, editing and dismissal while a save is pending', async () => {
    const pending = deferred<CatalogProduct>();
    updateProduct.mockReturnValueOnce(pending.promise);
    await renderCatalog();
    await press(`catalog-product-${generic.id}`);
    await press('catalog-edit-save');
    await press('catalog-edit-save');
    await press('catalog-edit-cancel');
    await hardwareBack();

    expect(updateProduct).toHaveBeenCalledTimes(1);
    expect(renderer!.root.findByProps({testID: 'catalog-edit-name'}).props.editable).toBe(false);
    expect(renderer!.root.findByProps({testID: 'catalog-edit-photo-camera'}).props.disabled).toBe(true);
    expect(renderer!.root.findByProps({testID: 'catalog-edit-photo-library'}).props.disabled).toBe(true);
    expect(renderer!.root.findByProps({testID: 'catalog-edit-photo-clear'}).props.disabled).toBe(true);
    expect(renderer!.root.findByProps({testID: 'catalog-edit-delete'}).props.disabled).toBe(true);
    await press('catalog-edit-delete');
    expect(alert).not.toHaveBeenCalled();
    expect(renderer!.root.findByType(CatalogProductEditModal).props.product).toEqual(generic);
    expect(onRequestClose).not.toHaveBeenCalled();
    await act(async () => pending.resolve(edited));
    expect(onProductUpdated).toHaveBeenCalledTimes(1);
  });

  it.each(['resolve', 'reject'] as const)('ignores an old search that finishes late with %s', async completion => {
    const oldSearch = deferred<CatalogProduct[]>();
    const currentSearch = deferred<CatalogProduct[]>();
    searchCatalog.mockReturnValueOnce(oldSearch.promise).mockReturnValueOnce(currentSearch.promise);
    await renderCatalog();
    await change('catalog-search', 'old');
    await change('catalog-search', 'new');
    await act(async () => currentSearch.resolve([specific]));
    await act(async () => {
      if (completion === 'resolve') { oldSearch.resolve([generic]); }
      else { oldSearch.reject(new Error('Old search failure')); }
    });

    expect(displayedProducts()).toEqual([specific]);
    expect(texts()).not.toContain('Nie udało się wczytać katalogu. Spróbuj ponownie.');
  });

  it('retries a failed load and distinguishes an empty catalog from empty search results', async () => {
    getCatalog.mockRejectedValueOnce(new Error('Load failure')).mockResolvedValueOnce([]);
    searchCatalog.mockResolvedValueOnce([]);
    await renderCatalog();
    expect(texts()).toContain('Nie udało się wczytać katalogu. Spróbuj ponownie.');

    await press('catalog-retry');
    expect(texts()).toContain('Katalog jest pusty');
    await change('catalog-search', 'missing');
    expect(texts()).toContain('Brak pasujących produktów');
  });

  it('allows retry after opening a product fails', async () => {
    findProduct.mockRejectedValueOnce(new Error('Read failure')).mockResolvedValueOnce(generic);
    await renderCatalog();
    await press(`catalog-product-${generic.id}`);

    expect(texts()).toContain('Nie udało się otworzyć produktu. Spróbuj ponownie.');
    await press(`catalog-product-${generic.id}`);
    expect(renderer!.root.findByType(CatalogProductEditModal).props.product).toEqual(generic);
  });

  it('ignores an old product lookup after the search has changed', async () => {
    const lookup = deferred<CatalogProduct | null>();
    findProduct.mockReturnValueOnce(lookup.promise);
    await renderCatalog();
    await press(`catalog-product-${generic.id}`);

    await change('catalog-search', '590123');
    await act(async () => lookup.resolve(generic));

    expect(displayedProducts()).toEqual([specific]);
    expect(renderer!.root.findByType(CatalogProductEditModal).props.product).toBeNull();
  });

  it('refreshes the list when a selected product is no longer available', async () => {
    getCatalog.mockResolvedValueOnce([generic]).mockResolvedValueOnce([]);
    findProduct.mockResolvedValueOnce(null);
    await renderCatalog();

    await press(`catalog-product-${generic.id}`);

    expect(texts()).toContain('Ten produkt nie jest już dostępny w katalogu.');
    expect(displayedProducts()).toEqual([]);
    expect(renderer!.root.findByType(CatalogProductEditModal).props.product).toBeNull();
  });

  it('reports a refresh failure separately after a successful save and can reload without saving again', async () => {
    getCatalog.mockResolvedValueOnce([generic]).mockRejectedValueOnce(new Error('Refresh failure')).mockResolvedValueOnce([edited]);
    await renderCatalog();
    await press(`catalog-product-${generic.id}`);

    await press('catalog-edit-save');

    expect(texts()).toContain('Zapisano zmiany produktu.');
    expect(texts()).toContain('Nie udało się wczytać katalogu. Spróbuj ponownie.');
    expect(onProductUpdated).toHaveBeenCalledTimes(1);
    expect(renderer!.root.findByType(CatalogProductEditModal).props.product).toBeNull();
    await press('catalog-retry');
    expect(displayedProducts()).toEqual([edited]);
    expect(updateProduct).toHaveBeenCalledTimes(1);
  });

  it('closes the editor before leaving the catalog on hardware back', async () => {
    await renderCatalog();
    await press(`catalog-product-${generic.id}`);
    await hardwareBack();
    expect(renderer!.root.findByType(CatalogProductEditModal).props.product).toBeNull();
    expect(onRequestClose).not.toHaveBeenCalled();

    await hardwareBack();
    expect(onRequestClose).toHaveBeenCalledTimes(1);
  });

  it.each([
    {product: generic, source: 'library'},
    {product: specific, source: 'camera'},
    {product: {...generic, imageUrl: null}, source: 'camera'},
    {product: {...specific, imageUrl: null}, source: 'library'},
  ] as const)('adds or replaces the $product.kind photo using the $source and refreshes readers after saving', async ({product, source}) => {
    findProduct.mockResolvedValue(product);
    const launcher = source === 'camera' ? launchCamera : launchImageLibrary;
    jest.mocked(launcher).mockResolvedValue({assets: [{uri: 'content://picker/new-photo', fileName: 'photo.PNG'}]});
    await renderCatalog();
    await press(`catalog-product-${product.id}`);
    await press(`catalog-edit-photo-${source}`);

    expect(launcher).toHaveBeenCalledWith({mediaType: 'photo', selectionLimit: 1, quality: 0.82, includeBase64: false});
    expect(mkdir).toHaveBeenCalledWith('/documents/product-photos');
    const destination = jest.mocked(copyFile).mock.calls[0][1];
    expect(copyFile).toHaveBeenCalledWith('content://picker/new-photo', expect.stringMatching(/^\/documents\/product-photos\/.+\.png$/));
    const storedUri = `file://${destination}`;
    expect(photoPreview()).toBe(storedUri);
    expect(updateProduct).not.toHaveBeenCalled();
    getCatalog.mockResolvedValue([{...product, imageUrl: storedUri}]);
    await press('catalog-edit-save');

    expect(updateProduct).toHaveBeenCalledWith(product.id, {
      name: product.name, brand: product.brand, category: product.category, imageUrl: storedUri,
    });
    expect(onProductUpdated).toHaveBeenCalledTimes(1);
    expect(displayedProducts()).toMatchObject([{id: product.id, imageUrl: storedUri}]);
    expect(unlink).not.toHaveBeenCalled();
  });

  it('discards a selected photo when cancelled and restores the stored photo when reopened', async () => {
    jest.mocked(launchImageLibrary).mockResolvedValue({assets: [{uri: 'file:///temporary/new.jpg'}]});
    await renderCatalog();
    await press(`catalog-product-${generic.id}`);
    await press('catalog-edit-photo-library');
    expect(photoPreview()).not.toBe(generic.imageUrl);
    const discardedPhoto = photoPreview().slice('file://'.length);
    await press('catalog-edit-cancel');
    await press(`catalog-product-${generic.id}`);

    expect(photoPreview()).toBe(generic.imageUrl);
    expect(updateProduct).not.toHaveBeenCalled();
    expect(onProductUpdated).not.toHaveBeenCalled();
    expect(unlink).toHaveBeenCalledWith(discardedPhoto);
  });

  it('removes superseded and cleared draft copies while preserving the stored photo', async () => {
    jest.mocked(launchImageLibrary).mockResolvedValue({assets: [{uri: 'file:///temporary/new.jpg'}]});
    await renderCatalog();
    await press(`catalog-product-${generic.id}`);
    await press('catalog-edit-photo-library');
    const first = photoPreview().slice('file://'.length);
    await press('catalog-edit-photo-library');
    const second = photoPreview().slice('file://'.length);

    expect(unlink).toHaveBeenCalledWith(first);
    expect(unlink).not.toHaveBeenCalledWith(second);
    await press('catalog-edit-photo-clear');
    expect(unlink).toHaveBeenCalledWith(second);
    expect(unlink).not.toHaveBeenCalledWith(generic.imageUrl!.slice('file://'.length));
    expect(updateProduct).not.toHaveBeenCalled();
  });

  it('keeps the photo and draft when the native picker is cancelled', async () => {
    await renderCatalog();
    await press(`catalog-product-${generic.id}`);
    await change('catalog-edit-name', 'Nowa nazwa');
    await press('catalog-edit-photo-library');

    expect(photoPreview()).toBe(generic.imageUrl);
    expect(copyFile).not.toHaveBeenCalled();
    expect(renderer!.root.findByProps({testID: 'catalog-edit-name'}).props.value).toBe('Nowa nazwa');
    expect(renderer!.root.findByProps({testID: 'catalog-edit-save'}).props.disabled).toBe(false);
    await press('catalog-edit-save');
    expect(updateProduct).toHaveBeenCalledWith(generic.id, {name: 'Nowa nazwa', brand: generic.brand, category: generic.category});
  });

  it.each([generic, specific])('removes the $kind photo only after saving', async product => {
    await renderCatalog();
    await press(`catalog-product-${product.id}`);
    await press('catalog-edit-photo-clear');

    expect(photoPreview()).toBeUndefined();
    expect(texts()).toContain('Brak zdjęcia');
    expect(updateProduct).not.toHaveBeenCalled();
    await press('catalog-edit-save');
    expect(updateProduct).toHaveBeenCalledWith(product.id, {
      name: product.name, brand: product.brand, category: product.category, imageUrl: null,
    });
  });

  it.each(['picker rejection', 'picker error', 'missing asset', 'copy failure'])(
    'keeps the current photo after %s and allows choosing another photo',
    async failure => {
      let message = 'Nie udało się dodać zdjęcia';
      if (failure === 'picker rejection') {
        jest.mocked(launchImageLibrary).mockRejectedValueOnce(new Error('Native failure'));
      } else if (failure === 'picker error') {
        jest.mocked(launchImageLibrary).mockResolvedValueOnce({errorCode: 'others'});
      } else if (failure === 'missing asset') {
        jest.mocked(launchImageLibrary).mockResolvedValueOnce({assets: []});
        message = 'Nie udało się odczytać wybranego zdjęcia';
      } else {
        jest.mocked(launchImageLibrary).mockResolvedValueOnce({assets: [{uri: 'file:///temporary/new.jpg'}]});
        jest.mocked(copyFile).mockRejectedValueOnce(new Error('Disk full'));
        message = 'Nie udało się zapisać zdjęcia w pamięci aplikacji';
      }
      await renderCatalog();
      await press(`catalog-product-${generic.id}`);
      await change('catalog-edit-name', 'Nowa nazwa');
      await press('catalog-edit-photo-library');

      expect(photoPreview()).toBe(generic.imageUrl);
      expect(texts()).toContain(message);
      expect(renderer!.root.findByProps({testID: 'catalog-edit-name'}).props.value).toBe('Nowa nazwa');
      expect(updateProduct).not.toHaveBeenCalled();
      jest.mocked(launchCamera).mockResolvedValueOnce({assets: [{uri: 'file:///temporary/retry.jpg', type: 'image/webp'}]});
      await press('catalog-edit-photo-camera');

      expect(photoPreview()).toMatch(/^file:\/\/\/documents\/product-photos\/.+\.webp$/);
      expect(texts()).not.toContain(message);
      expect(renderer!.root.findByProps({testID: 'catalog-edit-save'}).props.disabled).toBe(false);
    },
  );

  it('blocks duplicate photo selection and saving while the native picker is pending', async () => {
    const pending = deferred<{didCancel: boolean}>();
    jest.mocked(launchImageLibrary).mockReturnValueOnce(pending.promise);
    await renderCatalog();
    await press(`catalog-product-${generic.id}`);
    const pick = renderer!.root.findByProps({testID: 'catalog-edit-photo-library'}).props.onPress;
    await act(async () => { pick(); pick(); });
    await press('catalog-edit-save');

    expect(launchImageLibrary).toHaveBeenCalledTimes(1);
    expect(updateProduct).not.toHaveBeenCalled();
    expect(renderer!.root.findByProps({testID: 'catalog-edit-save'}).props.disabled).toBe(true);
    expect(renderer!.root.findByProps({testID: 'catalog-edit-delete'}).props.disabled).toBe(true);
    await press('catalog-edit-delete');
    expect(alert).not.toHaveBeenCalled();
    await act(async () => pending.resolve({didCancel: true}));
    expect(renderer!.root.findByProps({testID: 'catalog-edit-save'}).props.disabled).toBe(false);
  });

  it('waits for the permanent photo copy before allowing a save', async () => {
    const copying = deferred<void>();
    jest.mocked(launchCamera).mockResolvedValueOnce({assets: [{uri: 'file:///temporary/camera.jpg'}]});
    jest.mocked(copyFile).mockReturnValueOnce(copying.promise);
    await renderCatalog();
    await press(`catalog-product-${generic.id}`);
    await press('catalog-edit-photo-camera');
    await press('catalog-edit-save');

    expect(photoPreview()).toBe(generic.imageUrl);
    expect(updateProduct).not.toHaveBeenCalled();
    expect(renderer!.root.findByProps({testID: 'catalog-edit-save'}).props.disabled).toBe(true);
    await act(async () => copying.resolve());
    await press('catalog-edit-save');
    expect(updateProduct).toHaveBeenCalledWith(generic.id, expect.objectContaining({
      imageUrl: `file://${jest.mocked(copyFile).mock.calls[0][1]}`,
    }));
  });

  it.each(['success', 'error'])(
    'ignores a late photo copy %s after closing the editor and opening another product',
    async completion => {
      const copying = deferred<void>();
      jest.mocked(launchImageLibrary).mockResolvedValueOnce({assets: [{uri: 'file:///temporary/new.jpg'}]});
      jest.mocked(copyFile).mockReturnValueOnce(copying.promise);
      await renderCatalog();
      await press(`catalog-product-${generic.id}`);
      await press('catalog-edit-photo-library');
      await hardwareBack();
      await press(`catalog-product-${specific.id}`);
      await act(async () => {
        if (completion === 'success') { copying.resolve(); }
        else { copying.reject(new Error('Late copy failure')); }
      });

      expect(photoPreview()).toBe(specific.imageUrl);
      expect(texts()).not.toContain('Nie udało się zapisać zdjęcia w pamięci aplikacji');
      expect(updateProduct).not.toHaveBeenCalled();
      expect(renderer!.root.findByProps({testID: 'catalog-edit-save'}).props.disabled).toBe(false);
      expect(unlink).toHaveBeenCalledWith(jest.mocked(copyFile).mock.calls[0][1]);
    },
  );

  it('keeps the selected photo after a database error and retries without copying it again', async () => {
    jest.mocked(launchImageLibrary).mockResolvedValueOnce({assets: [{uri: 'file:///temporary/new.jpg'}]});
    updateProduct.mockRejectedValueOnce(new Error('Write failure')).mockResolvedValueOnce(edited);
    await renderCatalog();
    await press(`catalog-product-${generic.id}`);
    await press('catalog-edit-photo-library');
    const selectedPhoto = photoPreview();
    await press('catalog-edit-save');

    expect(photoPreview()).toBe(selectedPhoto);
    expect(texts()).toContain('Nie udało się zapisać zmian. Spróbuj ponownie.');
    expect(onProductUpdated).not.toHaveBeenCalled();
    expect(unlink).not.toHaveBeenCalled();
    await press('catalog-edit-save');
    expect(updateProduct).toHaveBeenCalledTimes(2);
    expect(updateProduct).toHaveBeenLastCalledWith(generic.id, expect.objectContaining({imageUrl: selectedPhoto}));
    expect(copyFile).toHaveBeenCalledTimes(1);
    expect(onProductUpdated).toHaveBeenCalledTimes(1);
    expect(unlink).not.toHaveBeenCalled();
  });

  it.each(['success', 'failure'])(
    'protects the selected file if the catalog unmounts during a save, then handles %s',
    async outcome => {
      const pending = deferred<CatalogProduct>();
      updateProduct.mockReturnValueOnce(pending.promise);
      jest.mocked(launchImageLibrary).mockResolvedValueOnce({assets: [{uri: 'file:///temporary/new.jpg'}]});
      await renderCatalog();
      await press(`catalog-product-${generic.id}`);
      await press('catalog-edit-photo-library');
      const selectedFile = photoPreview().slice('file://'.length);
      await press('catalog-edit-save');
      await act(async () => renderer?.unmount());
      renderer = undefined;

      expect(unlink).not.toHaveBeenCalled();
      await act(async () => {
        if (outcome === 'success') { pending.resolve({...generic, imageUrl: `file://${selectedFile}`}); }
        else { pending.reject(new Error('Write failure')); }
      });
      if (outcome === 'success') { expect(unlink).not.toHaveBeenCalled(); }
      else { expect(unlink).toHaveBeenCalledWith(selectedFile); }
    },
  );

  it('keeps the draft after camera permission is denied and allows granting it on retry', async () => {
    checkCameraPermission.mockResolvedValue(false);
    requestCameraPermission.mockResolvedValueOnce(PermissionsAndroid.RESULTS.DENIED).mockResolvedValueOnce(PermissionsAndroid.RESULTS.GRANTED);
    jest.mocked(launchCamera).mockResolvedValueOnce({assets: [{uri: 'file:///temporary/camera.jpg'}]});
    await renderCatalog();
    await press(`catalog-product-${generic.id}`);
    await change('catalog-edit-name', 'Niezapisana nazwa');
    await press('catalog-edit-photo-camera');

    expect(texts()).toContain('Brak zgody na użycie aparatu. Zezwól na dostęp, aby zrobić zdjęcie.');
    expect(photoPreview()).toBe(generic.imageUrl);
    expect(renderer!.root.findByProps({testID: 'catalog-edit-name'}).props.value).toBe('Niezapisana nazwa');
    expect(renderer!.root.findByProps({testID: 'catalog-edit-save'}).props.disabled).toBe(false);
    expect(launchCamera).not.toHaveBeenCalled();
    expect(copyFile).not.toHaveBeenCalled();
    expect(updateProduct).not.toHaveBeenCalled();
    await press('catalog-edit-photo-camera');

    expect(requestCameraPermission).toHaveBeenCalledTimes(2);
    expect(launchCamera).toHaveBeenCalledTimes(1);
    expect(photoPreview()).not.toBe(generic.imageUrl);
    expect(texts()).not.toContain('Brak zgody na użycie aparatu. Zezwól na dostęp, aby zrobić zdjęcie.');
    const selectedPhoto = photoPreview();
    await press('catalog-edit-save');
    expect(updateProduct).toHaveBeenCalledWith(generic.id, expect.objectContaining({name: 'Niezapisana nazwa', imageUrl: selectedPhoto}));
  });

  it('blocks saving while camera permission is pending and releases the form after denial', async () => {
    const permission = deferred<typeof PermissionsAndroid.RESULTS.DENIED>();
    checkCameraPermission.mockResolvedValue(false);
    requestCameraPermission.mockReturnValueOnce(permission.promise);
    await renderCatalog();
    await press(`catalog-product-${generic.id}`);
    await press('catalog-edit-photo-camera');
    await press('catalog-edit-save');

    expect(renderer!.root.findByProps({testID: 'catalog-edit-save'}).props.disabled).toBe(true);
    expect(launchCamera).not.toHaveBeenCalled();
    expect(updateProduct).not.toHaveBeenCalled();
    await act(async () => permission.resolve(PermissionsAndroid.RESULTS.DENIED));
    expect(renderer!.root.findByProps({testID: 'catalog-edit-save'}).props.disabled).toBe(false);
    expect(photoPreview()).toBe(generic.imageUrl);
  });

  it('opens app settings after permanent denial and uses the granted permission when the user returns', async () => {
    checkCameraPermission.mockResolvedValue(false);
    requestCameraPermission.mockResolvedValue(PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN);
    await renderCatalog();
    await press(`catalog-product-${generic.id}`);
    await change('catalog-edit-brand', 'Nowa marka');
    await press('catalog-edit-photo-camera');

    expect(texts()).toContain('Dostęp do aparatu jest zablokowany. Włącz go w ustawieniach aplikacji.');
    expect(launchCamera).not.toHaveBeenCalled();
    expect(photoPreview()).toBe(generic.imageUrl);
    await press('catalog-edit-photo-settings');
    expect(openSettings).toHaveBeenCalledTimes(1);
    expect(renderer!.root.findByProps({testID: 'catalog-edit-brand'}).props.value).toBe('Nowa marka');
    checkCameraPermission.mockResolvedValue(true);
    jest.mocked(launchCamera).mockResolvedValueOnce({assets: [{uri: 'file:///temporary/allowed.jpg'}]});
    await press('catalog-edit-photo-camera');

    expect(requestCameraPermission).toHaveBeenCalledTimes(1);
    expect(launchCamera).toHaveBeenCalledTimes(1);
    expect(renderer!.root.findAllByProps({testID: 'catalog-edit-photo-settings'})).toHaveLength(0);
    expect(renderer!.root.findByProps({testID: 'catalog-edit-brand'}).props.value).toBe('Nowa marka');
    expect(updateProduct).not.toHaveBeenCalled();
  });

  it('keeps the draft and allows retry if opening app settings fails', async () => {
    checkCameraPermission.mockResolvedValue(false);
    requestCameraPermission.mockResolvedValue(PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN);
    openSettings.mockRejectedValueOnce(new Error('Settings unavailable')).mockResolvedValueOnce();
    await renderCatalog();
    await press(`catalog-product-${generic.id}`);
    await press('catalog-edit-photo-camera');
    await press('catalog-edit-photo-settings');

    expect(texts()).toContain('Nie udało się otworzyć ustawień aplikacji. Spróbuj ponownie.');
    expect(photoPreview()).toBe(generic.imageUrl);
    await press('catalog-edit-photo-settings');
    expect(openSettings).toHaveBeenCalledTimes(2);
    expect(updateProduct).not.toHaveBeenCalled();
  });

  it('allows gallery selection when camera permission is permanently denied', async () => {
    checkCameraPermission.mockResolvedValue(false);
    requestCameraPermission.mockResolvedValue(PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN);
    jest.mocked(launchImageLibrary).mockResolvedValueOnce({assets: [{uri: 'file:///temporary/gallery.jpg'}]});
    await renderCatalog();
    await press(`catalog-product-${generic.id}`);
    await press('catalog-edit-photo-camera');
    await press('catalog-edit-photo-library');

    expect(launchImageLibrary).toHaveBeenCalledTimes(1);
    expect(photoPreview()).not.toBe(generic.imageUrl);
    expect(renderer!.root.findAllByProps({testID: 'catalog-edit-photo-settings'})).toHaveLength(0);
    expect(requestCameraPermission).toHaveBeenCalledTimes(1);
  });
});
