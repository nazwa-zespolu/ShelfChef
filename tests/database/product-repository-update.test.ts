import {sqlite} from '../helpers/sqlite';

jest.mock('react-native-quick-sqlite', () => ({
  open: () => sqlite,
}), {virtual: true});

import {ProductRepository} from '../../src/infrastructure/ProductRepository';
import {setupDatabase} from '../../src/infrastructure/db/init';

describe('ProductRepository inventory updates', () => {
  let repository: ProductRepository;

  beforeEach(() => {
    sqlite.reset();
    setupDatabase();
    repository = new ProductRepository();
  });

  afterAll(() => sqlite.close());

  it('updates the expiry date and marks one inventory item as opened', async () => {
    await repository.addToInventory('item-to-update', null, 'Pesto', '2026-08-01');
    await repository.addToInventory('item-to-keep', null, 'Olive oil', '2027-01-15');

    await repository.updateInventoryItem('item-to-update', {
      expiryDate: '2026-09-10',
      openedAt: '2026-10-13T09:30:00.000Z',
    });

    const items = await repository.getFullInventory();
    const updatedItem = items.find(item => item.id === 'item-to-update');
    const unchangedItem = items.find(item => item.id === 'item-to-keep');

    expect(updatedItem).toMatchObject({
      expiryDate: '2026-09-10',
      isOpened: true,
      openedAt: '2026-10-13T09:30:00.000Z',
    });
    expect(unchangedItem).toMatchObject({
      expiryDate: '2027-01-15',
      isOpened: false,
      openedAt: null,
    });
  });

  it('removes the expiry date and closes an opened inventory item', async () => {
    await repository.addToInventory('item-to-close', null, 'Soy sauce', '2026-11-20');
    await repository.markAsOpened('item-to-close', '2026-10-12T18:00:00.000Z');

    await repository.updateInventoryItem('item-to-close', {
      expiryDate: null,
      openedAt: null,
    });

    expect(await repository.getFullInventory()).toEqual([
      expect.objectContaining({
        id: 'item-to-close',
        expiryDate: null,
        isOpened: false,
        openedAt: null,
      }),
    ]);
  });

  it('persists inventory item changes after reopening the database', async () => {
    await repository.addToInventory('persistent-item', null, 'Tahini', null);
    await repository.updateInventoryItem('persistent-item', {
      expiryDate: '2027-03-01',
      openedAt: '2026-10-13T10:00:00.000Z',
    });

    sqlite.reopen();
    setupDatabase();

    expect(await repository.getFullInventory()).toEqual([
      expect.objectContaining({
        id: 'persistent-item',
        expiryDate: '2027-03-01',
        isOpened: true,
        openedAt: '2026-10-13T10:00:00.000Z',
      }),
    ]);
  });
});
