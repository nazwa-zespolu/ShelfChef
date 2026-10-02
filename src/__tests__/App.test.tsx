/**
 * @format
 */

import React from 'react';
import {Button, Text} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';
import App from '../App';
import HomeView from '../HomeView';
import RecipeGeneratorView from '../RecipeGeneratorView';
import BottomNav from '../components/BottomNav';
import {setupDatabase} from '../infrastructure/db/init';

jest.mock('../infrastructure/db/init', () => ({setupDatabase: jest.fn()}));
jest.mock('../HomeView', () => jest.fn(() => null));
jest.mock('../ProductScannerView', () => jest.fn(() => null));
jest.mock('../RecipeGeneratorView', () => jest.fn(() => null));
jest.mock('../ShoppingListView', () => jest.fn(() => null));
jest.mock('../components/BottomNav', () => jest.fn(() => null));
jest.mock('react-native-executorch', () => ({initExecutorch: jest.fn()}));
jest.mock('react-native-executorch-bare-resource-fetcher', () => ({BareResourceFetcher: {}}), {virtual: true});
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: require('react-native').View,
}));

let renderer: ReactTestRenderer.ReactTestRenderer;
let consoleError: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(setupDatabase).mockReset();
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  if (renderer) {
    await act(() => renderer.unmount());
  }
  consoleError.mockRestore();
});

test('initializes the database before mounting any database-dependent screens', async () => {
  jest.mocked(setupDatabase).mockImplementation(() => {
    expect(HomeView).not.toHaveBeenCalled();
    expect(RecipeGeneratorView).not.toHaveBeenCalled();
    expect(BottomNav).not.toHaveBeenCalled();
  });

  await act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  expect(setupDatabase).toHaveBeenCalledTimes(1);
  expect(HomeView).toHaveBeenCalled();
  expect(RecipeGeneratorView).toHaveBeenCalled();
  expect(BottomNav).toHaveBeenCalled();
});

test('keeps screens unmounted on database failure and opens them after a successful retry', async () => {
  const failure = new Error('Database unavailable');
  jest.mocked(setupDatabase).mockImplementationOnce(() => { throw failure; });

  await act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  expect(HomeView).not.toHaveBeenCalled();
  expect(RecipeGeneratorView).not.toHaveBeenCalled();
  expect(BottomNav).not.toHaveBeenCalled();
  expect(consoleError).toHaveBeenCalledWith('[ShelfChef] setupDatabase failed', failure);
  expect(renderer.root.findAllByType(Text).some(
    text => text.props.children === 'Nie udało się otworzyć danych aplikacji.',
  )).toBe(true);

  await act(() => {
    renderer.root.findByType(Button).props.onPress();
  });

  expect(setupDatabase).toHaveBeenCalledTimes(2);
  expect(HomeView).toHaveBeenCalled();
  expect(RecipeGeneratorView).toHaveBeenCalled();
  expect(renderer.root.findAllByType(Button)).toHaveLength(0);
});
