import React from 'react';
import {Keyboard, Text, TextInput} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {AddItemModal} from '../shopping-lists/modals/AddItemModal';
import {EditItemModal} from '../shopping-lists/modals/EditItemModal';
import {ListFormModal} from '../shopping-lists/modals/ListFormModal';
import {ShoppingIconAppearancePicker} from '../shopping-lists/components/ShoppingIconAppearancePicker';
import {useKeyboardVisible} from '../shopping-lists/hooks/useKeyboardVisible';
import type {AutoShoppingListItemState, CatalogProduct} from '../domain/types';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));
jest.mock('lucide-react-native', () => {
  const {View: MockIcon} = require('react-native');
  return {Search: MockIcon, Pencil: MockIcon, ClipboardList: MockIcon, RefreshCcw: MockIcon, Check: MockIcon, X: MockIcon, Package: MockIcon};
});
jest.mock('../shoppingListIcons', () => {
  const {View: MockIcon} = require('react-native');
  const icons = [
    {key: 'box', label: 'Zapasy', Icon: MockIcon},
    {key: 'basket', label: 'Koszyk', Icon: MockIcon},
  ];
  const colors = [
    {key: 'green', label: 'Zielony', color: '#5f8d56', background: '#e3ecdf'},
    {key: 'blue', label: 'Niebieski', color: '#3877c8', background: '#e0eafa'},
  ];
  return {
    DEFAULT_SHOPPING_LIST_ICON_COLOR_KEY: 'green',
    SHOPPING_LIST_ICONS: icons,
    SHOPPING_LIST_ICON_COLORS: colors,
    getShoppingListIconDefinition: (key: string) => icons.find(icon => icon.key === key) ?? icons[0],
    getShoppingListIconColorDefinition: (key: string) => colors.find(color => color.key === key) ?? colors[0],
  };
});
jest.mock('../shopping-lists/hooks/useKeyboardVisible', () => ({useKeyboardVisible: jest.fn(() => false)}));
jest.mock('../shopping-lists/modals/DraggableBottomSheet', () => ({
  DraggableBottomSheet: ({visible, children}: {visible: boolean; children: React.ReactNode}) => visible ? children : null,
}));

const product: CatalogProduct = {
  id: 'catalog-soup', name: 'Żurek', normalizedName: 'żurek', kind: 'generic', productEan: null,
  brand: null, category: null, imageUrl: null, parentCatalogProductId: null,
  createdAt: '2026-10-24T10:00:00.000Z', updatedAt: '2026-10-24T10:00:00.000Z',
};
const item: AutoShoppingListItemState = {
  id: 'item-soup', listId: 'list', catalogProductId: null, linkedCatalogProducts: [], label: 'Zupa',
  iconKey: 'box', iconColorKey: 'green', imageUrl: null, quantity: 1, sortOrder: 0,
  status: 'planned', source: 'manual', storedAt: null, createdAt: product.createdAt, updatedAt: product.updatedAt,
  effectiveStatus: 'planned', currentQuantity: 0, missingQuantity: 1,
};

describe('UI: Shopping form interactions', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  const consoleError = jest.spyOn(console, 'error');
  const dismissKeyboard = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
  const onIcon = jest.fn();
  const onColor = jest.fn();
  const onQuery = jest.fn();
  const onSelect = jest.fn();
  const onSubmit = jest.fn();
  const addProps: React.ComponentProps<typeof AddItemModal> = {
    visible: true, quantity: '1', iconKey: 'box', iconColorKey: 'green', catalogQuery: '',
    catalogResults: [product], selectedCatalog: null, feedback: null, busy: false,
    onChangeQuantity: jest.fn(), onChangeIconKey: onIcon, onChangeIconColorKey: onColor,
    onChangeCatalogQuery: onQuery, onSelectCatalog: onSelect, onClose: jest.fn(), onSubmit,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useKeyboardVisible).mockReturnValue(false);
  });
  afterEach(async () => {
    await act(async () => { renderer?.unmount(); });
    renderer = undefined;
    expect(consoleError).not.toHaveBeenCalled();
  });
  afterAll(() => {
    consoleError.mockRestore();
    dismissKeyboard.mockRestore();
  });

  const render = async (element: React.ReactElement) => {
    await act(async () => { renderer = ReactTestRenderer.create(element); });
  };
  const texts = () => renderer!.root.findAllByType(Text).map(node => node.props.children);
  const nameField = () => renderer!.root.findByType(TextInput);
  const button = (label: string) => renderer!.root.findAll(node => typeof node.props.onPress === 'function')
    .find(node => node.findAllByType(Text).some(text => text.props.children === label))!;
  const press = async (label: string) => {
    expect(button(label)).toBeDefined();
    await act(async () => { button(label).props.onPress(); });
  };
  const expectAppearanceBeforeName = () => {
    const fields = renderer!.root.findAll(node => node.type === ShoppingIconAppearancePicker || node.type === TextInput);
    expect(fields[0].type).toBe(ShoppingIconAppearancePicker);
    expect(fields.some(node => node.type === TextInput)).toBe(true);
  };

  it('keeps cached catalog results and the empty prompt hidden until the name field is entered', async () => {
    await render(<AddItemModal {...addProps} />);
    expectAppearanceBeforeName();
    expect(texts()).not.toContain('Wyniki z katalogu');
    expect(texts()).not.toContain('Wpisz nazwę produktu');
    expect(texts()).not.toContain(product.name);
    expect(button('Dodaj produkt').props.disabled).toBe(true);

    await act(async () => { nameField().props.onFocus(); });

    expect(texts()).toContain('Wyniki z katalogu');
    expect(texts()).toContain(product.name);
    await press('Wybierz');
    expect(onSelect).toHaveBeenCalledWith(product);
  });

  it('collapses appearance while typing, restores it through the explicit appearance action and allows adding a text item without catalog matches', async () => {
    jest.mocked(useKeyboardVisible).mockReturnValue(true);
    await render(<AddItemModal {...addProps} catalogQuery="Domowa zupa" catalogResults={[]} />);
    expectAppearanceBeforeName();
    expect(texts()).toContain('Brak wyników katalogu');
    expect(texts()).not.toContain('Koszyk');
    expect(renderer!.root.findAllByProps({
      accessibilityLabel: 'Ikona produktu: Zapasy. Kolor ikony produktu: Zielony',
    })).toHaveLength(0);
    expect(renderer!.root.findByProps({testID: 'compact-appearance-icon'})).toBeDefined();

    await press('Zmień ikonę i kolor');
    expect(dismissKeyboard).toHaveBeenCalledTimes(1);
    jest.mocked(useKeyboardVisible).mockReturnValue(false);
    await act(async () => {
      renderer!.update(<AddItemModal {...addProps} catalogQuery="Domowa zupa" catalogResults={[]} />);
    });

    await press('Koszyk');
    await act(async () => {
      renderer!.root.findByProps({accessibilityLabel: 'Kolor ikony produktu: Niebieski'}).props.onPress();
      nameField().props.onChangeText('Nowa nazwa');
    });
    expect(onIcon).toHaveBeenCalledWith('basket');
    expect(onColor).toHaveBeenCalledWith('blue');
    expect(onQuery).toHaveBeenCalledWith('Nowa nazwa');
    expect(button('Dodaj produkt').props.disabled).toBe(false);
    await press('Dodaj produkt');
    expect(onSubmit).toHaveBeenCalledTimes(1);

    jest.mocked(useKeyboardVisible).mockReturnValue(true);
    await act(async () => {
      renderer!.update(<AddItemModal {...addProps} catalogQuery="Nowa nazwa" catalogResults={[]} iconKey="basket" iconColorKey="blue" />);
    });
    expect(renderer!.root.findAllByProps({
      accessibilityLabel: 'Ikona produktu: Koszyk. Kolor ikony produktu: Niebieski',
    })).toHaveLength(0);
    expect(texts()).toContain('Brak wyników katalogu');
    expect(texts()).toContain('Zmień ikonę i kolor');
  });

  it.each(['create', 'edit', 'text-item'] as const)('collapses appearance with the keyboard and restores the current selection in the %s form', async form => {
    const element = () => form === 'text-item' ? (
      <EditItemModal
        item={item} name="Zupa" iconKey="basket" iconColorKey="blue" feedback={null} busy={false}
        onChangeName={onQuery} onChangeIconKey={onIcon} onChangeIconColorKey={onColor}
        onClose={jest.fn()} onSubmit={onSubmit}
      />
    ) : (
      <ListFormModal
        visible mode={form} name="Zakupy" type="manual" iconKey="basket" iconColorKey="blue"
        feedback={null} busy={false} onChangeName={onQuery} onChangeType={jest.fn()}
        onChangeIconKey={onIcon} onChangeIconColorKey={onColor} onClose={jest.fn()} onSubmit={onSubmit}
      />
    );
    jest.mocked(useKeyboardVisible).mockReturnValue(true);
    await render(element());
    expect(texts()).not.toContain('Zapasy');
    expect(renderer!.root.findAllByType(ShoppingIconAppearancePicker)).toHaveLength(0);
    expect(texts()).toContain('Zmień ikonę i kolor');

    await press('Zmień ikonę i kolor');
    expect(dismissKeyboard).toHaveBeenCalledTimes(1);
    jest.mocked(useKeyboardVisible).mockReturnValue(false);
    await act(async () => { renderer!.update(element()); });
    expect(texts()).toContain('Zapasy');
    expect(texts()).not.toContain('Zmień ikonę i kolor');
    expect(nameField().props.value).toBe(form === 'text-item' ? 'Zupa' : 'Zakupy');
    expect(renderer!.root.findByType(ShoppingIconAppearancePicker).props).toMatchObject({
      compact: false, iconKey: 'basket', iconColorKey: 'blue',
    });
    await press('Zapasy');
    expect(onIcon).toHaveBeenCalledWith('box');
  });

  it('keeps the activated catalog available when the keyboard closes and resets it when the empty form is reopened', async () => {
    jest.mocked(useKeyboardVisible).mockReturnValue(true);
    await render(<AddItemModal {...addProps} catalogResults={[]} />);
    expect(texts()).not.toContain('Wpisz nazwę produktu');
    await act(async () => { nameField().props.onFocus(); });
    expect(texts()).toContain('Wpisz nazwę produktu');

    jest.mocked(useKeyboardVisible).mockReturnValue(false);
    await act(async () => { renderer!.update(<AddItemModal {...addProps} catalogResults={[]} />); });
    expect(texts()).toContain('Wyniki z katalogu');
    await act(async () => { renderer!.update(<AddItemModal {...addProps} visible={false} />); });
    await act(async () => { renderer!.update(<AddItemModal {...addProps} />); });

    expectAppearanceBeforeName();
    expect(texts()).not.toContain('Wyniki z katalogu');
    expect(texts()).not.toContain('Wpisz nazwę produktu');
  });

  it.each(['create', 'edit'] as const)('places appearance before the name in the %s list form and preserves editing callbacks', async mode => {
    const onName = jest.fn();
    await render(<ListFormModal
      visible mode={mode} name="Zakupy" type="manual" iconKey="box" iconColorKey="green"
      feedback={null} busy={false} onChangeName={onName} onChangeType={jest.fn()}
      onChangeIconKey={onIcon} onChangeIconColorKey={onColor} onClose={jest.fn()} onSubmit={onSubmit}
    />);
    expectAppearanceBeforeName();
    await press('Koszyk');
    await act(async () => { nameField().props.onChangeText('Nowa lista'); });
    await press(mode === 'create' ? 'Utwórz listę' : 'Zapisz zmiany');

    expect(onIcon).toHaveBeenCalledWith('basket');
    expect(onName).toHaveBeenCalledWith('Nowa lista');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(texts().includes('Typ listy')).toBe(mode === 'create');
  });

  it('places appearance before the name in text-item editing and preserves the save action', async () => {
    const onName = jest.fn();
    await render(<EditItemModal
      item={item} name={item.label} iconKey="box" iconColorKey="green" feedback={null} busy={false}
      onChangeName={onName} onChangeIconKey={onIcon} onChangeIconColorKey={onColor}
      onClose={jest.fn()} onSubmit={onSubmit}
    />);
    expectAppearanceBeforeName();
    await press('Koszyk');
    await act(async () => { nameField().props.onChangeText('Zupa na obiad'); });
    await press('Zapisz zmiany');

    expect(onIcon).toHaveBeenCalledWith('basket');
    expect(onName).toHaveBeenCalledWith('Zupa na obiad');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
