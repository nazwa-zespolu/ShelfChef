import {
  getExpiringProducts,
  getExpiryUrgency,
} from '../../src/domain/expiry';
import {InventoryItem} from '../../src/domain/types';

const inventoryItem = (
  id: string,
  name: string,
  expiryDate: string | null,
): InventoryItem => ({
  id,
  catalogProductId: null,
  ean: '',
  name,
  expiryDate,
  isOpened: false,
  createdAt: '2026-04-01T10:00:00.000Z',
});

describe('UC-04: getExpiringProducts', () => {
  const now = new Date(2026, 3, 8, 12);

  it('returns expired products and products expiring within two days in date order', () => {
    const items = [
      inventoryItem('1', 'Rice', '2026-04-11'),
      inventoryItem('2', 'Milk', '2026-04-09'),
      inventoryItem('3', 'Yogurt', '2026-04-10'),
      inventoryItem('4', 'Cheese', '2026-04-07'),
    ];

    const result = getExpiringProducts(items, now);

    expect(result.map(item => item.name)).toEqual(['Cheese', 'Milk', 'Yogurt']);
    expect(items.map(item => item.name)).toEqual(['Rice', 'Milk', 'Yogurt', 'Cheese']);
  });

  it('excludes products without a valid expiration date', () => {
    const result = getExpiringProducts([
      inventoryItem('1', 'Salt', null),
      inventoryItem('2', 'Flour', ''),
      inventoryItem('3', 'Oil', 'not-a-date'),
      inventoryItem('4', 'Butter', '2026-02-30'),
      inventoryItem('5', 'Milk', '2026-04-09'),
    ], now);

    expect(result.map(item => item.name)).toEqual(['Milk']);
  });

  it('uses calendar days across daylight-saving time changes', () => {
    const beforeClockChange = new Date(2026, 2, 28, 23, 30);

    const result = getExpiringProducts([
      inventoryItem('1', 'Milk', '2026-03-30'),
      inventoryItem('2', 'Rice', '2026-03-31'),
    ], beforeClockChange);

    expect(result.map(item => item.name)).toEqual(['Milk']);
  });
});

describe('getExpiryUrgency', () => {
  const now = new Date(2026, 3, 8, 12);

  it.each([
    ['2026-04-07', {status: 'expired', daysRemaining: -1}],
    ['2026-04-08', {status: 'today', daysRemaining: 0}],
    ['2026-04-09', {status: 'tomorrow', daysRemaining: 1}],
    ['2026-04-10', {status: 'soon', daysRemaining: 2}],
  ] as const)('maps %s to its urgency', (expiryDate, expected) => {
    expect(getExpiryUrgency(expiryDate, now)).toEqual(expected);
  });

  it('returns null when expiration is more than two days away', () => {
    expect(getExpiryUrgency('2026-04-11', now)).toBeNull();
  });
});
