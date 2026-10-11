import {
  compareExpiry,
  formatExpiryLine,
  formatOpenedDateTime,
  formatOpenedDuration,
  formatOpenedLine,
} from '../../src/utils/inventory';
import {InventoryItem} from '../../src/domain/types';

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

describe('inventory formatting helpers', () => {
  it('formats the expiration date as a readable string', () => {
    const formatted = formatExpiryLine('2026-04-15');

    expect(formatted).toContain('15.04');
    expect(formatted).toContain('2026');
  });

  it('sorts products by the nearest expiration date', () => {
    const later = inventoryItem('1', 'Jogurt', '2026-04-10');
    const sooner = inventoryItem('2', 'Mleko', '2026-04-09');

    expect([later, sooner].sort(compareExpiry).map(item => item.name)).toEqual([
      'Mleko',
      'Jogurt',
    ]);
  });

  it('formatuje czas otwarcia poniżej godziny w minutach', () => {
    expect(
      formatOpenedDuration(
        '2026-06-11T12:10:00.000Z',
        new Date('2026-06-11T12:45:00.000Z'),
      ),
    ).toBe('35 min');
  });

  it('formatuje czas otwarcia w godzinach', () => {
    expect(
      formatOpenedDuration(
        '2026-06-11T08:30:00.000Z',
        new Date('2026-06-11T11:45:00.000Z'),
      ),
    ).toBe('3 godz.');
  });

  it('formatuje czas otwarcia w dniach', () => {
    expect(
      formatOpenedDuration(
        '2026-06-08T08:30:00.000Z',
        new Date('2026-06-11T11:45:00.000Z'),
      ),
    ).toBe('3 dni');
  });

  it('formatuje datę otwarcia z godziną', () => {
    const formatted = formatOpenedDateTime('2026-06-11T14:30:00');

    expect(formatted).toContain('11.06');
    expect(formatted).toContain('14:30');
  });

  it('pokazuje fallback dla otwartego produktu bez poprawnej daty', () => {
    expect(formatOpenedLine({isOpened: true, openedAt: null})).toBe('Otwarte · brak daty');
    expect(formatOpenedLine({isOpened: true, openedAt: 'nie-data'})).toBe('Otwarte · brak daty');
  });

  it('nie pokazuje informacji o otwarciu dla zamkniętego produktu', () => {
    expect(formatOpenedLine({isOpened: false, openedAt: '2026-06-11T14:30:00.000Z'})).toBeNull();
  });
});
