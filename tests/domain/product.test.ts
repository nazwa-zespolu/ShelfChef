import {sqlite} from '../helpers/sqlite';

jest.mock('react-native-quick-sqlite', () => ({
  open: () => sqlite,
}), {virtual: true});

import {setupDatabase} from '../../src/infrastructure/db/init';
import {ProductRepository} from '../../src/infrastructure/ProductRepository';

describe('inventory product state', () => {
  let repository: ProductRepository;

  beforeEach(() => {
    sqlite.reset();
    setupDatabase();
    repository = new ProductRepository();
  });

  afterAll(() => sqlite.close());

  it('stores a new product as closed', async () => {
    await repository.addToInventory('uuid-3', null, 'Sok pomarańczowy', '2026-05-15');

    const [product] = await repository.getFullInventory();

    expect(product.isOpened).toBe(false);
    expect(product.openedAt).toBeNull();
  });

  it('stores the opening date when a product is marked as opened', async () => {
    await repository.addToInventory('uuid-4', null, 'Ketchup', '2026-08-01');
    await repository.markAsOpened('uuid-4', '2026-04-08T12:00:00.000Z');

    const [product] = await repository.getFullInventory();

    expect(product.isOpened).toBe(true);
    expect(product.openedAt).toBe('2026-04-08T12:00:00.000Z');
  });
});
