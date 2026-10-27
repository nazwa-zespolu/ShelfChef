import React from 'react';
import {Text} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {ReplenishmentSuggestionsScreen} from '../shopping-lists/screens/ReplenishmentSuggestionsScreen';
import type {ShoppingSuggestion} from '../domain/types';

jest.mock('lucide-react-native', () => {
  const {View: MockIcon} = require('react-native');
  return {Check: MockIcon, ClipboardList: MockIcon, Package: MockIcon, Search: MockIcon, ShoppingBag: MockIcon};
});
jest.mock('../shoppingListIcons', () => ({DEFAULT_SHOPPING_LIST_ICON_COLOR_KEY: 'green'}));
jest.mock('../shopping-lists/components/ShoppingItemIconBubble', () => ({ShoppingItemIconBubble: () => null}));

describe('UI: ReplenishmentSuggestionsScreen empty states', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  const baseProps: React.ComponentProps<typeof ReplenishmentSuggestionsScreen> = {
    suggestions: [], manualLists: [], targetListId: null, busy: false, loading: true,
    onBack: jest.fn(), onSelectTargetList: jest.fn(), onMergeSuggestions: jest.fn(), onRefresh: jest.fn(),
  };
  const shortage: ShoppingSuggestion = {
    catalogProductId: 'catalog-milk', linkedCatalogProductIds: [], name: 'Mleko', normalizedName: 'mleko',
    missingQuantity: 2, currentQuantity: 0, targetQuantity: 2, reason: 'Brak w spiżarni', priority: 'out',
    sourceAutoListIds: ['minimum'], sourceAutoListNames: ['Minimum zapasów'],
  };
  const texts = () => renderer!.root.findAllByType(Text).map(node => node.props.children);

  afterEach(async () => {
    await act(async () => { renderer?.unmount(); });
    renderer = undefined;
  });

  it('shows completion only after empty shortage data has finished loading and hides it during refresh', async () => {
    await act(async () => {
      renderer = ReactTestRenderer.create(<ReplenishmentSuggestionsScreen {...baseProps} />);
    });

    expect(texts()).toContain('Wczytuję braki…');
    expect(texts()).not.toContain('Wszystko uzupełnione');

    await act(async () => {
      renderer!.update(<ReplenishmentSuggestionsScreen {...baseProps} loading={false} />);
    });

    expect(texts()).toContain('Wszystko uzupełnione');
    expect(texts()).not.toContain('Wczytuję braki…');

    await act(async () => {
      renderer!.update(<ReplenishmentSuggestionsScreen {...baseProps} loading />);
    });

    expect(texts()).toContain('Wczytuję braki…');
    expect(texts()).not.toContain('Wszystko uzupełnione');
  });

  it('replaces the loading state with actual shortages instead of a completion message', async () => {
    await act(async () => {
      renderer = ReactTestRenderer.create(<ReplenishmentSuggestionsScreen {...baseProps} />);
    });
    await act(async () => {
      renderer!.update(<ReplenishmentSuggestionsScreen {...baseProps} loading={false} suggestions={[shortage]} />);
    });

    expect(texts()).toContain(shortage.name);
    expect(texts()).toContain(shortage.reason);
    expect(texts()).not.toContain('Wczytuję braki…');
    expect(texts()).not.toContain('Wszystko uzupełnione');
  });
});
