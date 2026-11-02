import {sqlite} from '../helpers/sqlite';

jest.mock('react-native-quick-sqlite', () => ({
  open: () => sqlite,
}), {virtual: true});

import {setupDatabase} from '../../src/infrastructure/db/init';
import {ProductRepository} from '../../src/infrastructure/ProductRepository';

describe('UC-03: DeleteProduct', () => {
  beforeEach(() => {
    sqlite.reset();
    setupDatabase();
  });

  afterAll(() => sqlite.close());

  it('deletes a product from the database by id', async () => {
    const repository = new ProductRepository();
    await repository.addToInventory('uuid-123', null, 'Ketchup', '2026-08-01');

    await repository.removeFromInventory('uuid-123');

    expect(await repository.getFullInventory()).toEqual([]);
  });
});
