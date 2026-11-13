/**
 * @format
 */

import React from 'react';
import {BackHandler, FlatList, Text} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';
import HomeView from '../HomeView';
import {InventoryItem} from '../domain/types';
import {ProductRepository} from '../infrastructure/ProductRepository';
import {ProductDetailsModal} from '../components/ProductDetailsModal';

jest.mock('../components/SwipeToDeleteCard', () => ({
  SwipeToDeleteCard: ({children}: {children: React.ReactNode}) => children,
}));
jest.mock('../components/AppToast', () => ({
  AppToast: () => null,
  useAppToast: () => ({
    toast: null,
    toastAnim: {interpolate: jest.fn()},
    showToast: jest.fn(),
  }),
}));
jest.mock('../shopping-lists/modals/DraggableBottomSheet', () => ({
  DraggableBottomSheet: ({
    visible,
    children,
    handleContent,
  }: {
    visible: boolean;
    children: React.ReactNode;
    handleContent?: React.ReactNode;
  }) => {
    const {createElement, Fragment} = require('react');
    return visible ? createElement(Fragment, null, handleContent, children) : null;
  },
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));
jest.mock('lucide-react-native', () => {
  const {View: MockIcon} = require('react-native');
  return {
    CalendarDays: MockIcon,
    ArrowLeft: MockIcon,
    Clock3: MockIcon,
    Package: MockIcon,
    Search: MockIcon,
    Check: MockIcon,
  };
});

const inventoryItem = (
  id: string,
  name: string,
  expiryDate: string | null,
  overrides: Partial<InventoryItem> = {},
): InventoryItem => ({
  id,
  catalogProductId: null,
  ean: '',
  name,
  expiryDate,
  isOpened: false,
  createdAt: '2026-04-08T10:00:00.000Z',
  ...overrides,
});

const deferredSave = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(resolvePromise => {
    resolve = resolvePromise;
  });
  return {promise, resolve};
};

describe('UI: HomeView', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  const getFullInventory = jest.spyOn(ProductRepository.prototype, 'getFullInventory');
  const updateInventoryItem = jest.spyOn(ProductRepository.prototype, 'updateInventoryItem');
  const addBackHandler = jest.spyOn(BackHandler, 'addEventListener');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 3, 8, 12));
    getFullInventory.mockReset();
    updateInventoryItem.mockReset().mockResolvedValue();
    addBackHandler.mockClear();
  });

  afterEach(async () => {
    if (renderer) {
      await act(() => renderer?.unmount());
      renderer = undefined;
    }
    jest.useRealTimers();
  });

  const renderHome = async (items: InventoryItem[]) => {
    getFullInventory.mockResolvedValue(items);
    await act(async () => {
      renderer = ReactTestRenderer.create(<HomeView />);
    });
  };

  const press = async (testID: string) => {
    await act(async () => {
      renderer!.root.findByProps({testID}).props.onPress();
      await Promise.resolve();
    });
  };

  const changeExpiryDay = async (day: number) => {
    await press('product-expiry-field');
    await act(() => {
      renderer!.root
        .findByProps({testID: 'product-expiry-picker'})
        .findByProps({label: 'Dzień'}).props.onValueChange(day);
    });
  };

  const displayedItems = () =>
    renderer!.root.findByType(FlatList).props.data as InventoryItem[];

  const displayedTexts = () =>
    renderer!.root.findAllByType(Text)
      .flatMap(node =>
        Array.isArray(node.props.children) ? node.props.children : [node.props.children],
      )
      .filter((child): child is string => typeof child === 'string');

  const selectSort = async (label: string) => {
    const button = renderer!.root.find(node =>
      typeof node.props.onPress === 'function' &&
      node.findAllByType(Text).some(text => text.props.children === label),
    );
    await act(() => button.props.onPress());
  };

  it('displays products sorted by expiration date', async () => {
    getFullInventory.mockResolvedValue([
      inventoryItem('1', 'Jogurt', '2026-04-10'),
      inventoryItem('2', 'Mleko', '2026-04-09'),
    ]);

    await act(async () => {
      renderer = ReactTestRenderer.create(<HomeView />);
    });

    const productNames = renderer!.root
      .findAllByType(Text)
      .filter(node => node.props.children === 'Mleko' || node.props.children === 'Jogurt')
      .map(node => node.props.children);

    expect(getFullInventory).toHaveBeenCalledTimes(1);
    expect(productNames).toEqual(['Mleko', 'Jogurt']);
  });

  it('shows an empty state when there are no products', async () => {
    getFullInventory.mockResolvedValue([]);

    await act(async () => {
      renderer = ReactTestRenderer.create(<HomeView />);
    });

    const texts = renderer!.root.findAllByType(Text).map(node => node.props.children);
    expect(texts).toContain('Brak produktów');
  });

  it('filters the pantry to urgent expiration dates and returns to all products', async () => {
    getFullInventory.mockResolvedValue([
      inventoryItem('1', 'Rice', '2026-04-11'),
      inventoryItem('2', 'Milk', '2026-04-09'),
      inventoryItem('3', 'Yogurt', '2026-04-10'),
      inventoryItem('4', 'Cheese', '2026-04-07'),
    ]);

    await act(async () => {
      renderer = ReactTestRenderer.create(<HomeView />);
    });

    const expiryButton = renderer!.root.findByProps({testID: 'expiry-filter-button'});
    expect(expiryButton.props.accessibilityLabel).toBe('Pilne terminy, 3 produkty');

    await act(() => expiryButton.props.onPress());

    const urgentProductNames = renderer!.root
      .findAllByType(Text)
      .filter(node => ['Rice', 'Milk', 'Yogurt', 'Cheese'].includes(node.props.children))
      .map(node => node.props.children);
    const urgencyLabels = renderer!.root
      .findAllByType(Text)
      .flatMap(node =>
        Array.isArray(node.props.children) ? node.props.children : [node.props.children],
      )
      .filter((child): child is string => typeof child === 'string')

    expect(urgentProductNames).toEqual(['Cheese', 'Milk', 'Yogurt']);
    expect(urgencyLabels).toEqual(
      expect.arrayContaining(['Po terminie', 'Termin jutro', 'Pozostały 2 dni']),
    );
    expect(renderer!.root.findByProps({testID: 'expiry-filter-button'}).props.accessibilityLabel)
      .toBe('Wróć do spiżarni');

    await act(() => {
      renderer!.root.findByProps({testID: 'expiry-filter-button'}).props.onPress();
    });

    const allProductNames = renderer!.root
      .findAllByType(Text)
      .filter(node => ['Rice', 'Milk', 'Yogurt', 'Cheese'].includes(node.props.children))
      .map(node => node.props.children);
    expect(allProductNames).toEqual(['Cheese', 'Milk', 'Yogurt', 'Rice']);
  });

  it('shows the urgent expiration empty state when no product requires attention', async () => {
    getFullInventory.mockResolvedValue([
      inventoryItem('1', 'Rice', '2026-04-11'),
      inventoryItem('2', 'Salt', null),
    ]);

    await act(async () => {
      renderer = ReactTestRenderer.create(<HomeView />);
    });

    const expiryButton = renderer!.root.findByProps({testID: 'expiry-filter-button'});
    expect(expiryButton.props.accessibilityLabel).toBe(
      'Pilne terminy, brak produktów wymagających uwagi',
    );

    await act(() => expiryButton.props.onPress());

    const texts = renderer!.root.findAllByType(Text).map(node => node.props.children);
    expect(texts).toContain('Brak pilnych terminów');
  });

  it('returns to the full pantry on the Android system back gesture', async () => {
    getFullInventory.mockResolvedValue([
      inventoryItem('1', 'Milk', '2026-04-09'),
      inventoryItem('2', 'Rice', '2026-04-11'),
    ]);

    await act(async () => {
      renderer = ReactTestRenderer.create(<HomeView />);
    });
    await act(() => {
      renderer!.root.findByProps({testID: 'expiry-filter-button'}).props.onPress();
    });

    const backHandler = addBackHandler.mock.calls.find(
      ([eventName]) => eventName === 'hardwareBackPress',
    )?.[1];
    expect(backHandler).toBeDefined();

    let handled = false;
    await act(() => {
      handled = backHandler!() === true;
    });

    expect(handled).toBe(true);
    const texts = renderer!.root.findAllByType(Text).map(node => node.props.children);
    expect(texts).toContain('Spiżarnia');
    expect(texts).not.toContain('Pilne terminy');
  });

  it('opens product details and saves a new expiry and open state', async () => {
    getFullInventory.mockResolvedValue([
      inventoryItem('1', 'Tomatoes', null, {
        ean: '5901234123457',
        brand: 'Pantry Foods',
        category: 'Canned food',
      }),
    ]);

    await act(async () => {
      renderer = ReactTestRenderer.create(<HomeView />);
    });

    await act(() => {
      renderer!.root.findByProps({testID: 'product-card-1'}).props.onPress();
    });

    const texts = renderer!.root.findAllByType(Text).map(node => node.props.children);
    expect(texts).toContain('Szczegóły produktu');
    expect(texts).toContain('EAN: 5901234123457');

    await act(() => {
      renderer!.root.findByProps({testID: 'product-expiry-field'}).props.onPress();
      renderer!.root.findByProps({testID: 'product-state-opened'}).props.onPress();
    });
    await act(() => {
      renderer!.root.findByProps({label: 'Dzień'}).props.onValueChange(15);
    });
    await act(async () => {
      renderer!.root.findByProps({testID: 'product-details-save'}).props.onPress();
      await Promise.resolve();
    });

    expect(updateInventoryItem).toHaveBeenCalledWith('1', {
      expiryDate: '2026-04-15',
      openedAt: expect.any(String),
    });
  });

  it('removes the expiry date and closes an opened product', async () => {
    getFullInventory.mockResolvedValue([
      inventoryItem('1', 'Pesto', '2026-04-20', {
        isOpened: true,
        openedAt: '2026-04-07T09:00:00.000Z',
      }),
    ]);

    await act(async () => {
      renderer = ReactTestRenderer.create(<HomeView />);
    });
    await act(() => {
      renderer!.root.findByProps({testID: 'product-card-1'}).props.onPress();
    });
    await act(() => {
      renderer!.root.findByProps({testID: 'product-expiry-remove'}).props.onPress();
      renderer!.root.findByProps({testID: 'product-state-closed'}).props.onPress();
    });
    await act(async () => {
      renderer!.root.findByProps({testID: 'product-details-save'}).props.onPress();
      await Promise.resolve();
    });

    expect(updateInventoryItem).toHaveBeenCalledWith('1', {
      expiryDate: null,
      openedAt: null,
    });
  });

  it('changes the opening date without allowing future calendar values', async () => {
    const originalOpenedAt = '2026-04-07T09:30:00.000Z';
    const expectedOpenedAt = new Date(originalOpenedAt);
    expectedOpenedAt.setFullYear(
      expectedOpenedAt.getFullYear(),
      expectedOpenedAt.getMonth(),
      5,
    );
    getFullInventory.mockResolvedValue([
      inventoryItem('1', 'Jam', '2026-05-01', {
        isOpened: true,
        openedAt: originalOpenedAt,
      }),
    ]);

    await act(async () => {
      renderer = ReactTestRenderer.create(<HomeView />);
    });
    await act(() => {
      renderer!.root.findByProps({testID: 'product-card-1'}).props.onPress();
    });
    await act(() => {
      renderer!.root.findByProps({testID: 'product-opening-date-field'}).props.onPress();
    });

    const openingPicker = renderer!.root.findByProps({testID: 'product-opening-date-picker'});
    const dayPicker = openingPicker.findByProps({label: 'Dzień'});
    const monthPicker = openingPicker.findByProps({label: 'Miesiąc'});
    const yearPicker = openingPicker.findByProps({label: 'Rok'});
    expect(dayPicker.props.values.at(-1)).toBe(8);
    expect(monthPicker.props.values.at(-1)).toBe(4);
    expect(yearPicker.props.values.at(-1)).toBe(2026);

    await act(() => {
      dayPicker.props.onValueChange(5);
    });
    await act(async () => {
      renderer!.root.findByProps({testID: 'product-details-save'}).props.onPress();
      await Promise.resolve();
    });

    expect(updateInventoryItem).toHaveBeenCalledWith('1', {
      expiryDate: '2026-05-01',
      openedAt: expectedOpenedAt.toISOString(),
    });
  });

  it('preserves the exact opening timestamp when the date is not changed', async () => {
    const openedAt = '2026-04-07T09:30:45.000Z';
    getFullInventory.mockResolvedValue([
      inventoryItem('1', 'Jam', null, {isOpened: true, openedAt}),
    ]);

    await act(async () => {
      renderer = ReactTestRenderer.create(<HomeView />);
    });
    await act(() => {
      renderer!.root.findByProps({testID: 'product-card-1'}).props.onPress();
    });
    await act(async () => {
      renderer!.root.findByProps({testID: 'product-details-save'}).props.onPress();
      await Promise.resolve();
    });

    expect(updateInventoryItem).toHaveBeenCalledWith('1', {
      expiryDate: null,
      openedAt,
    });
  });

  it('preserves the draft and inventory after a failed save and allows retrying', async () => {
    const items = [inventoryItem('1', 'Jam', '2026-04-09')];
    const openedAt = new Date().toISOString();
    const retrySave = deferredSave();
    updateInventoryItem
      .mockRejectedValueOnce(new Error('Database write failed'))
      .mockReturnValueOnce(retrySave.promise);
    await renderHome(items);
    await press('product-card-1');
    await changeExpiryDay(15);
    await press('product-state-opened');
    await press('product-details-save');

    expect(displayedTexts()).toContain('Nie udało się zapisać zmian. Spróbuj ponownie.');
    expect(renderer!.root.findByProps({testID: 'product-details-save'}).props.disabled).toBe(false);
    expect(renderer!.root.findByProps({testID: 'product-details-cancel'}).props.disabled).toBe(false);
    expect(renderer!.root.findByProps({testID: 'product-expiry-picker'})
      .findByProps({label: 'Dzień'}).props.selectedValue).toBe(15);
    expect(displayedItems()).toEqual(items);

    await press('product-details-save');

    expect(displayedTexts()).not.toContain('Nie udało się zapisać zmian. Spróbuj ponownie.');
    expect(renderer!.root.findByProps({testID: 'product-details-save'}).props.disabled).toBe(true);
    expect(displayedItems()).toEqual(items);
    await act(async () => {
      retrySave.resolve();
      await retrySave.promise;
    });

    const changes = {expiryDate: '2026-04-15', openedAt};
    expect(updateInventoryItem).toHaveBeenCalledTimes(2);
    expect(updateInventoryItem).toHaveBeenNthCalledWith(1, '1', changes);
    expect(updateInventoryItem).toHaveBeenNthCalledWith(2, '1', changes);
    expect(renderer!.root.findAllByProps({testID: 'product-details-save'})).toHaveLength(0);
    expect(displayedTexts()).not.toContain('Nie udało się zapisać zmian. Spróbuj ponownie.');
    expect(displayedItems()).toEqual([
      {...items[0], ...changes, isOpened: true},
    ]);
  });

  it('blocks dismissal and duplicate saves until the pending write completes', async () => {
    const pendingSave = deferredSave();
    const items = [inventoryItem('1', 'Jam', '2026-04-09')];
    updateInventoryItem.mockReturnValueOnce(pendingSave.promise);
    await renderHome(items);
    await press('product-card-1');
    await changeExpiryDay(15);
    await press('product-details-save');

    expect(displayedTexts()).toContain('Zapisuję…');
    expect(renderer!.root.findByProps({testID: 'product-details-save'}).props.disabled).toBe(true);
    expect(renderer!.root.findByProps({testID: 'product-details-cancel'}).props.disabled).toBe(true);
    expect(displayedItems()).toEqual(items);

    await press('product-details-save');
    await press('product-details-cancel');
    await act(() => renderer!.root.findByType(ProductDetailsModal).props.onClose());

    expect(updateInventoryItem).toHaveBeenCalledTimes(1);
    expect(renderer!.root.findByProps({testID: 'product-details-save'}).props.disabled).toBe(true);

    await act(async () => {
      pendingSave.resolve();
      await pendingSave.promise;
    });

    expect(renderer!.root.findAllByProps({testID: 'product-details-save'})).toHaveLength(0);
    expect(displayedItems()[0]).toMatchObject({expiryDate: '2026-04-15', isOpened: false});
  });

  it.each([false, true])('reorders products by expiry date after saving with the urgent filter set to %s', async urgentOnly => {
    await renderHome([
      inventoryItem('1', 'Jam', '2026-04-08'),
      inventoryItem('2', 'Milk', '2026-04-09'),
    ]);
    await selectSort('Ważność');
    if (urgentOnly) {
      await press('expiry-filter-button');
    }
    expect(displayedItems().map(item => item.id)).toEqual(['1', '2']);

    await press('product-card-1');
    await changeExpiryDay(10);
    await press('product-details-save');

    expect(displayedItems().map(item => item.id)).toEqual(['2', '1']);
    expect(displayedItems()[1].expiryDate).toBe('2026-04-10');
  });

  it.each([false, true])('reorders products and updates the opened count when the initial open state is %s', async isOpened => {
    await renderHome([
      inventoryItem('1', 'Jam', '2026-04-09'),
      inventoryItem('2', 'Milk', '2026-04-10', {
        isOpened,
        openedAt: isOpened ? '2026-04-07T09:30:00.000Z' : null,
      }),
    ]);
    await selectSort('Otwarte');
    expect(displayedItems().map(item => item.id)).toEqual(isOpened ? ['2', '1'] : ['1', '2']);

    await press('product-card-2');
    await press(isOpened ? 'product-state-closed' : 'product-state-opened');
    await press('product-details-save');

    expect(displayedItems().map(item => item.id)).toEqual(isOpened ? ['1', '2'] : ['2', '1']);
    expect(displayedTexts()).toContain(isOpened ? '2 produkty · 0 otwarte' : '2 produkty · 1 otwarty');
    const updatedItem = displayedItems().find(item => item.id === '2');
    expect(updatedItem).toMatchObject({
      isOpened: !isOpened,
      openedAt: isOpened ? null : new Date().toISOString(),
    });
    await selectSort('Ważność');
  });

  it('updates the urgent count and includes a product after adding an urgent expiry date', async () => {
    await renderHome([
      inventoryItem('1', 'Jam', null),
      inventoryItem('2', 'Milk', '2026-04-20'),
    ]);
    expect(renderer!.root.findByProps({testID: 'expiry-filter-button'}).props.accessibilityLabel)
      .toBe('Pilne terminy, brak produktów wymagających uwagi');

    await press('product-card-1');
    await changeExpiryDay(9);
    await press('product-details-save');

    expect(renderer!.root.findByProps({testID: 'expiry-filter-button'}).props.accessibilityLabel)
      .toBe('Pilne terminy, 1 produkt');
    await press('expiry-filter-button');
    expect(displayedItems().map(item => item.id)).toEqual(['1']);
    expect(displayedTexts()).toContain('Termin jutro');
  });

  it.each(['remove', 'postpone'])('removes a product from the active urgent view after choosing to %s its expiry date', async action => {
    await renderHome([
      inventoryItem('1', 'Jam', '2026-04-09'),
      inventoryItem('2', 'Milk', '2026-04-20'),
    ]);
    await press('expiry-filter-button');
    expect(displayedItems().map(item => item.id)).toEqual(['1']);
    await press('product-card-1');
    if (action === 'remove') {
      await press('product-expiry-remove');
    } else {
      await changeExpiryDay(15);
    }
    await press('product-details-save');

    expect(displayedItems()).toEqual([]);
    expect(displayedTexts()).toContain('Pilne terminy');
    expect(displayedTexts()).toContain('Brak pilnych terminów');
    expect(displayedTexts()).toContain('0 produktów do sprawdzenia');

    await press('expiry-filter-button');
    expect(renderer!.root.findByProps({testID: 'expiry-filter-button'}).props.accessibilityLabel)
      .toBe('Pilne terminy, brak produktów wymagających uwagi');
    expect(displayedItems()).toHaveLength(2);
    expect(displayedItems().find(item => item.id === '1')?.expiryDate)
      .toBe(action === 'remove' ? null : '2026-04-15');
  });

  it('updates only the selected inventory item when two copies share an EAN', async () => {
    const ean = '5901234123457';
    const otherCopy = inventoryItem('2', 'Jam', '2026-04-20', {
      ean,
      isOpened: true,
      openedAt: '2026-04-07T09:30:45.123Z',
    });
    await renderHome([
      inventoryItem('1', 'Jam', '2026-04-09', {ean}),
      otherCopy,
    ]);
    await press('product-card-1');
    await changeExpiryDay(15);
    await press('product-state-opened');
    await press('product-details-save');

    expect(updateInventoryItem).toHaveBeenCalledWith('1', {
      expiryDate: '2026-04-15',
      openedAt: new Date().toISOString(),
    });
    expect(displayedItems()).toHaveLength(2);
    expect(displayedItems().find(item => item.id === '1')).toMatchObject({
      expiryDate: '2026-04-15',
      isOpened: true,
      openedAt: new Date().toISOString(),
    });
    expect(displayedItems().find(item => item.id === '2')).toEqual(otherCopy);
  });
});
