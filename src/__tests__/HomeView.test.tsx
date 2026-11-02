/**
 * @format
 */

import React from 'react';
import {Text} from 'react-native';
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

  beforeEach(() => {
    getFullInventory.mockReset();
  });

  afterEach(async () => {
    if (renderer) {
      await act(() => renderer?.unmount());
      renderer = undefined;
    }
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
});
