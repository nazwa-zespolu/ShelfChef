import {sqlite} from '../helpers/sqlite';

jest.mock('react-native-quick-sqlite', () => ({
  open: () => sqlite,
}), {virtual: true});

import {ProductRepository} from '../../src/infrastructure/ProductRepository';
import {db, setupDatabase} from '../../src/infrastructure/db/init';

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
      opening: {isOpened: true, openedAt: '2026-10-13T09:30:00.000Z'},
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
      opening: {isOpened: false, openedAt: null},
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
      opening: {isOpened: true, openedAt: '2026-10-13T10:00:00.000Z'},
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

  it.each([
    ['opening', {expiryDate: '2026-11-10', opening: {isOpened: true, openedAt: '2026-10-13T09:30:45.123Z'}}],
    ['closing', {expiryDate: null, opening: {isOpened: false, openedAt: null}}],
  ])('updates only one of two inventory items with the same EAN when %s it', async (_, changes) => {
    const ean = '5901234123457';
    await repository.saveDefinition({ean, name: 'Jam'});
    await repository.addToInventory('selected-copy', ean, null, '2026-11-01');
    await repository.addToInventory('other-copy', ean, null, '2026-12-01');
    await repository.markAsOpened('selected-copy', '2026-10-11T10:00:00.000Z');
    await repository.markAsOpened('other-copy', '2026-10-12T11:00:00.000Z');
    const otherCopy = (await repository.getFullInventory()).find(item => item.id === 'other-copy');

    await repository.updateInventoryItem('selected-copy', changes);

    const items = await repository.getFullInventory();
    expect(items).toHaveLength(2);
    expect(items.find(item => item.id === 'selected-copy')).toMatchObject({
      ean,
      expiryDate: changes.expiryDate,
      ...changes.opening,
    });
    expect(items.find(item => item.id === 'other-copy')).toEqual(otherCopy);
  });

  it.each([
    ['missing date', true, null],
    ['invalid date', true, 'not-a-date'],
    ['exact timestamp', true, '2026-10-13T09:30:45.123+02:00'],
    ['future date', true, '2999-01-01T10:00:00.000Z'],
    ['closed item with a stale date', false, '2026-10-13T09:30:45.123Z'],
  ] as const)('updates only expiry without writing opening fields for a %s', async (_, isOpened, openedAt) => {
    await repository.saveDefinition({ean: '5901234123457', name: 'Jogurt'});
    await repository.addToInventory('selected-copy', '5901234123457', null, '2026-12-01');
    await repository.addToInventory('other-copy', '5901234123457', null, '2026-12-02');
    db.execute('UPDATE inventory SET is_opened = ?, opened_at = ? WHERE id = ?', [isOpened, openedAt, 'selected-copy']);
    const before = await repository.getFullInventory();
    db.execute(`CREATE TRIGGER reject_opening_updates BEFORE UPDATE OF is_opened, opened_at ON inventory
      BEGIN SELECT RAISE(ABORT, 'opening fields must not be written'); END`);

    await repository.updateInventoryItem('selected-copy', {expiryDate: '2026-12-03'});
    sqlite.reopen();
    setupDatabase();

    const after = await repository.getFullInventory();
    expect(after.find(item => item.id === 'selected-copy')).toEqual({
      ...before.find(item => item.id === 'selected-copy'), expiryDate: '2026-12-03',
    });
    expect(after.find(item => item.id === 'other-copy')).toEqual(before.find(item => item.id === 'other-copy'));
  });

  it('persists an explicit opened state independently of a missing opening date', async () => {
    await repository.addToInventory('selected-copy', null, 'Jogurt', null);
    await repository.updateInventoryItem('selected-copy', {
      expiryDate: '2026-12-01', opening: {isOpened: true, openedAt: null},
    });
    sqlite.reopen();
    setupDatabase();
    expect(await repository.getFullInventory()).toEqual([
      expect.objectContaining({isOpened: true, openedAt: null, expiryDate: '2026-12-01'}),
    ]);
  });
});
