import React from 'react';
import {AppState} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {ProductDetailsModal} from '../components/ProductDetailsModal';
import type {InventoryItem} from '../domain/types';

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
jest.mock('lucide-react-native', () => {
  const {View: MockIcon} = require('react-native');
  return {CalendarDays: MockIcon, Package: MockIcon};
});

const inventoryItem = (openedAt: string): InventoryItem => ({
  id: '1',
  ean: '',
  name: 'Jam',
  expiryDate: '2026-05-20',
  isOpened: true,
  openedAt,
  createdAt: '2026-04-01T10:00:00.000Z',
});

describe('UI: ProductDetailsModal opening date limits', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  const onSave = jest.fn();
  const onClose = jest.fn();
  const removeAppStateListener = jest.fn();
  const addAppStateListener = jest.spyOn(AppState, 'addEventListener');

  beforeEach(() => {
    jest.useFakeTimers();
    onSave.mockReset();
    onClose.mockReset();
    removeAppStateListener.mockReset();
    addAppStateListener.mockReset().mockReturnValue({remove: removeAppStateListener});
  });

  afterEach(async () => {
    await act(() => renderer?.unmount());
    renderer = undefined;
    jest.useRealTimers();
  });

  afterAll(() => addAppStateListener.mockRestore());

  const renderModal = async (item: InventoryItem | null) => {
    await act(() => {
      const modal = (
        <ProductDetailsModal
          item={item}
          busy={false}
          errorMessage={null}
          onClose={onClose}
          onSave={onSave}
        />
      );
      if (renderer) {
        renderer.update(modal);
      } else {
        renderer = ReactTestRenderer.create(modal);
      }
    });
  };

  const press = async (testID: string) => {
    await act(() => renderer!.root.findByProps({testID}).props.onPress());
  };

  const openingWheel = (label: string) =>
    renderer!.root
      .findByProps({testID: 'product-opening-date-picker'})
      .findByProps({label});

  it.each([
    ['day', new Date(2026, 3, 8, 12), new Date(2026, 3, 9, 12)],
    ['month', new Date(2026, 3, 30, 12), new Date(2026, 4, 1, 12)],
    ['year', new Date(2026, 11, 31, 12), new Date(2027, 0, 1, 12)],
  ])('refreshes limits when opened after a %s change without remounting', async (_, before, after) => {
    jest.setSystemTime(before);
    await renderModal(null);

    jest.setSystemTime(after);
    await renderModal(inventoryItem(after.toISOString()));
    await press('product-opening-date-field');

    expect(openingWheel('Dzień').props.values.at(-1)).toBe(after.getDate());
    expect(openingWheel('Miesiąc').props.values.at(-1)).toBe(after.getMonth() + 1);
    expect(openingWheel('Rok').props.values.at(-1)).toBe(after.getFullYear());
  });

  it.each([
    ['day', new Date(2026, 3, 8, 23, 59, 59), new Date(2026, 3, 9)],
    ['month', new Date(2026, 3, 30, 23, 59, 59), new Date(2026, 4, 1)],
    ['year', new Date(2026, 11, 31, 23, 59, 59), new Date(2027, 0, 1)],
    ['spring clock change', new Date(2026, 2, 29, 0, 30), new Date(2026, 2, 30)],
    ['autumn clock change', new Date(2026, 9, 25, 0, 30), new Date(2026, 9, 26)],
  ])('refreshes at local midnight across %s while the panel stays open', async (_, before, after) => {
    jest.setSystemTime(before);
    const openedAt = before.toISOString();
    await renderModal(inventoryItem(openedAt));
    await press('product-opening-date-field');

    await act(() => jest.advanceTimersByTime(after.getTime() - before.getTime()));

    expect(openingWheel('Rok').props.values.at(-1)).toBe(after.getFullYear());
    await press('product-details-save');
    expect(onSave).toHaveBeenCalledWith({expiryDate: '2026-05-20', openedAt});

    if (before.getFullYear() !== after.getFullYear()) {
      await act(() => openingWheel('Rok').props.onValueChange(after.getFullYear()));
    }
    expect(openingWheel('Miesiąc').props.values.at(-1)).toBe(after.getMonth() + 1);
    if (openingWheel('Miesiąc').props.selectedValue !== after.getMonth() + 1) {
      await act(() => openingWheel('Miesiąc').props.onValueChange(after.getMonth() + 1));
    }
    expect(openingWheel('Dzień').props.values.at(-1)).toBe(after.getDate());
  });

  it('refreshes limits on foreground return without resetting the draft or opening timestamp', async () => {
    jest.setSystemTime(new Date(2026, 3, 30, 12));
    const openedAt = new Date(2026, 3, 30, 9, 30, 45, 123).toISOString();
    await renderModal(inventoryItem(openedAt));
    await press('product-expiry-field');
    await act(() => {
      renderer!.root
        .findByProps({testID: 'product-expiry-picker'})
        .findByProps({label: 'Dzień'}).props.onValueChange(11);
    });
    await press('product-opening-date-field');

    const onAppStateChange = addAppStateListener.mock.calls.find(([event]) => event === 'change')?.[1];
    expect(onAppStateChange).toBeDefined();
    await act(() => onAppStateChange!('background'));
    jest.setSystemTime(new Date(2026, 4, 1, 12));
    await act(() => onAppStateChange!('active'));

    expect(openingWheel('Miesiąc').props.values.at(-1)).toBe(5);
    await press('product-details-save');
    expect(onSave).toHaveBeenCalledWith({expiryDate: '2026-05-11', openedAt});
  });
});
