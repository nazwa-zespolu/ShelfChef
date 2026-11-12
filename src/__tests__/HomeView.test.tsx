/**
 * @format
 */

import React from 'react';
import {BackHandler, Text} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';
import HomeView from '../HomeView';
import {InventoryItem} from '../domain/types';
import {ProductRepository} from '../infrastructure/ProductRepository';

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
  };
});

const inventoryItem = (
  id: string,
  name: string,
  expiryDate: string | null,
): InventoryItem => ({
  id,
  ean: '',
  name,
  expiryDate,
  isOpened: false,
  createdAt: '2026-04-08T10:00:00.000Z',
});

describe('UI: HomeView', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  const getFullInventory = jest.spyOn(ProductRepository.prototype, 'getFullInventory');
  const addBackHandler = jest.spyOn(BackHandler, 'addEventListener');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 3, 8, 12));
    getFullInventory.mockReset();
    addBackHandler.mockClear();
  });

  afterEach(async () => {
    if (renderer) {
      await act(() => renderer?.unmount());
      renderer = undefined;
    }
    jest.useRealTimers();
  });

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
});
