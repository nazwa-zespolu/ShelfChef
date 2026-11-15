import {sqlite} from '../helpers/sqlite';

jest.mock('react-native-quick-sqlite', () => ({
  open: () => sqlite,
}), {virtual: true});

import {setupDatabase} from '../../src/infrastructure/db/init';
import {ProductRepository} from '../../src/infrastructure/ProductRepository';

describe('ProductRepository open state', () => {
  beforeEach(() => {
    sqlite.reset();
    setupDatabase();
  });

  afterAll(() => sqlite.close());

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
