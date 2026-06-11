type InventoryRow = {
  id: string;
  product_ean: string | null;
  custom_name: string | null;
  expiry_date: string | null;
  opened_at: string | null;
  is_opened: number;
  created_at: string;
};

const mockInventory = new Map<string, InventoryRow>();

const toRows = (data: Record<string, unknown>[]) => ({
  rows: {
    length: data.length,
    item: (index: number) => data[index],
  },
});

const mockExecute = jest.fn((sql: string, params: any[] = []) => {
  const normalized = sql.replace(/\s+/g, ' ').trim().toUpperCase();

  if (
    normalized.startsWith(
      'INSERT INTO INVENTORY ( ID, PRODUCT_EAN, CUSTOM_NAME, EXPIRY_DATE, CREATED_AT ) VALUES (?, ?, ?, ?, ?)',
    )
  ) {
    const [id, productEan, customName, expiryDate, createdAt] = params;
    mockInventory.set(id, {
      id,
      product_ean: productEan ?? null,
      custom_name: customName ?? null,
      expiry_date: expiryDate ?? null,
      opened_at: null,
      is_opened: 0,
      created_at: createdAt,
    });
    return toRows([]);
  }

  if (normalized.startsWith('UPDATE INVENTORY SET IS_OPENED = 1, OPENED_AT = ? WHERE ID = ?')) {
    const [date, id] = params;
    const row = mockInventory.get(id);
    if (row) {
      row.is_opened = 1;
      row.opened_at = date;
    }
    return toRows([]);
  }

  if (normalized.startsWith('UPDATE INVENTORY SET IS_OPENED = 0, OPENED_AT = NULL WHERE ID = ?')) {
    const [id] = params;
    const row = mockInventory.get(id);
    if (row) {
      row.is_opened = 0;
      row.opened_at = null;
    }
    return toRows([]);
  }

  if (normalized.startsWith('SELECT I.ID, I.EXPIRY_DATE, I.OPENED_AT, I.IS_OPENED, I.CUSTOM_NAME')) {
    return toRows(
      Array.from(mockInventory.values()).map(row => ({
        id: row.id,
        expiry_date: row.expiry_date,
        opened_at: row.opened_at,
        is_opened: row.is_opened,
        custom_name: row.custom_name,
        ean: row.product_ean,
        name: null,
        brand: null,
        image_url: null,
        category: null,
        created_at: row.created_at,
      })),
    );
  }

  throw new Error(`Unsupported SQL in product repository opened test: ${sql}`);
});

jest.mock('react-native-quick-sqlite', () => ({
  open: () => ({
    execute: mockExecute,
  }),
}), {virtual: true});

import {ProductRepository} from '../../src/infrastructure/ProductRepository';

describe('ProductRepository open state', () => {
  beforeEach(() => {
    mockInventory.clear();
    mockExecute.mockClear();
  });

  it('oznacza produkt jako otwarty i zapisuje openedAt', async () => {
    const repository = new ProductRepository();

    await repository.addToInventory('inv-open', null, 'Pesto', '2026-08-01');
    await repository.markAsOpened('inv-open', '2026-04-16T08:30:00.000Z');

    const items = await repository.getFullInventory();

    expect(items[0]).toMatchObject({
      id: 'inv-open',
      isOpened: true,
      openedAt: '2026-04-16T08:30:00.000Z',
    });
  });

  it('cofa otwarcie produktu i usuwa openedAt', async () => {
    const repository = new ProductRepository();

    await repository.addToInventory('inv-close', null, 'Sos sojowy', '2026-08-01');
    await repository.markAsOpened('inv-close', '2026-04-16T08:30:00.000Z');
    await repository.markAsClosed('inv-close');

    const items = await repository.getFullInventory();

    expect(items[0]).toMatchObject({
      id: 'inv-close',
      isOpened: false,
      openedAt: null,
    });
  });
});
