import React from 'react';
import {BackHandler, FlatList, Image, Text, TextInput} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';
import ProductCatalogView from '../ProductCatalogView';
import {CatalogProductEditModal} from '../components/CatalogProductEditModal';
import type {CatalogProduct} from '../domain/types';
import {CatalogProductUpdateError, ProductRepository} from '../infrastructure/ProductRepository';

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
  const backHandler = jest.spyOn(BackHandler, 'addEventListener');
  const consoleError = jest.spyOn(console, 'error');
  const onRequestClose = jest.fn();
  const onProductUpdated = jest.fn();

  beforeEach(() => {
    getCatalog.mockReset().mockResolvedValue([generic, specific]);
    searchCatalog.mockReset().mockResolvedValue([specific]);
    findProduct.mockReset().mockImplementation(async id => [generic, specific].find(product => product.id === id) ?? null);
    updateProduct.mockReset().mockResolvedValue(edited);
    backHandler.mockClear();
    consoleError.mockClear();
    onRequestClose.mockClear();
    onProductUpdated.mockClear();
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
    expect(consoleError).not.toHaveBeenCalled();
  });

  afterAll(() => {
    getCatalog.mockRestore();
    searchCatalog.mockRestore();
    findProduct.mockRestore();
    updateProduct.mockRestore();
    backHandler.mockRestore();
    consoleError.mockRestore();
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
  const hardwareBack = async () => {
    const handler = backHandler.mock.calls.at(-1)?.[1];
    expect(handler).toBeDefined();
    await act(async () => { expect(handler!()).toBe(true); });
  };

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
});
