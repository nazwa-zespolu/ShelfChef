import React from 'react';
import {
  Keyboard,
  Modal,
  PanResponder,
  Text,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { ProductDetailsModal } from '../components/ProductDetailsModal';
import { DraggableBottomSheet } from '../shopping-lists/modals/DraggableBottomSheet';
import type { InventoryItem } from '../domain/types';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, right: 0, bottom: 16, left: 0 }),
}));
jest.mock('lucide-react-native', () => {
  const { View: MockIcon } = require('react-native');
  return { CalendarDays: MockIcon, Package: MockIcon };
});

const item: InventoryItem = {
  id: 'inventory-soup',
  catalogProductId: 'catalog-soup',
  ean: '',
  name: 'Żurek',
  imageUrl: 'file:///photos/soup.jpg',
  expiryDate: '2026-11-10',
  isOpened: false,
  openedAt: null,
  createdAt: '2026-11-01T10:00:00.000Z',
};

describe('UI: Product photo preview in the existing native modal', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  const onClose = jest.fn();
  const onSave = jest.fn();
  const dismissKeyboard = jest.spyOn(Keyboard, 'dismiss');
  const consoleError = jest.spyOn(console, 'error');
  const createResponder = jest.spyOn(PanResponder, 'create');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });
  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
    jest.useRealTimers();
    expect(consoleError).not.toHaveBeenCalled();
  });
  afterAll(() => {
    dismissKeyboard.mockRestore();
    consoleError.mockRestore();
    createResponder.mockRestore();
  });

  const render = async (product: InventoryItem | null) => {
    const element = (
      <ProductDetailsModal
        item={product}
        busy={false}
        errorMessage={null}
        onClose={onClose}
        onSave={onSave}
      />
    );
    await act(async () => {
      if (renderer) {
        renderer.update(element);
      } else {
        renderer = ReactTestRenderer.create(element);
      }
    });
  };
  const press = async (testID: string) => {
    await act(async () =>
      renderer!.root.findByProps({ testID }).props.onPress(),
    );
  };
  const back = async () => {
    await act(async () =>
      renderer!.root.findByType(Modal).props.onRequestClose(),
    );
  };
  const isOpen = () =>
    renderer!.root.findByType(DraggableBottomSheet).props
      .accessibilityContentHidden;

  const gesture = async (
    name:
      | 'onPanResponderGrant'
      | 'onPanResponderMove'
      | 'onPanResponderEnd'
      | 'onPanResponderRelease',
    points: { x: number; y: number; id: number }[],
  ) => {
    const config = createResponder.mock.calls
      .filter(([options]) => options.onPanResponderStart)
      .at(-1)![0];
    const event = {
      nativeEvent: {
        touches: points.map(point => ({
          identifier: String(point.id),
          pageX: point.x + 40,
          pageY: point.y + 100,
          locationX: point.x,
          locationY: point.y,
        })),
      },
    } as unknown as GestureResponderEvent;
    await act(async () => config[name]!(event, {} as PanResponderGestureState));
  };
  const imageTransform = () => {
    const transforms = renderer!.root.findByProps({
      testID: 'product-photo-preview-image',
    }).props.style[1].transform;
    return {
      x: transforms[0].translateX.__getValue(),
      y: transforms[1].translateY.__getValue(),
      scale: transforms[2].scale.__getValue(),
    };
  };

  it.each(['close button', 'Back'])(
    'handles double tap, pinch and pan, then resets when reopened after %s',
    async closeMethod => {
      await render(item);
      await press('product-details-photo-preview');
      await act(async () => {
        renderer!.root
          .findByProps({ testID: 'product-photo-preview-viewport' })
          .props.onLayout({
            nativeEvent: { layout: { width: 300, height: 400 } },
          });
        renderer!.root
          .findByProps({ testID: 'product-photo-preview-image' })
          .props.onLoad({
            nativeEvent: { source: { width: 600, height: 800 } },
          });
      });
      for (let index = 0; index < 2; index += 1) {
        await gesture('onPanResponderGrant', [{ x: 100, y: 100, id: 1 }]);
        await gesture('onPanResponderRelease', []);
        await act(async () => jest.advanceTimersByTime(100));
      }
      expect(imageTransform()).toEqual({ scale: 2, x: 50, y: 100 });

      await gesture('onPanResponderGrant', [
        { x: 100, y: 200, id: 1 },
        { x: 200, y: 200, id: 2 },
      ]);
      await gesture('onPanResponderMove', [
        { x: 50, y: 200, id: 1 },
        { x: 250, y: 200, id: 2 },
      ]);
      expect(imageTransform().scale).toBe(4);
      await gesture('onPanResponderEnd', [{ x: 250, y: 200, id: 2 }]);
      await gesture('onPanResponderMove', [{ x: 300, y: 250, id: 2 }]);
      expect(imageTransform()).toEqual({ scale: 4, x: 150, y: 250 });
      await gesture('onPanResponderRelease', []);

      if (closeMethod === 'Back') {
        await back();
      } else {
        await press('product-photo-preview-close');
      }
      expect(onClose).not.toHaveBeenCalled();
      await press('product-details-photo-preview');
      expect(imageTransform()).toEqual({ scale: 1, x: 0, y: 0 });
      expect(onSave).not.toHaveBeenCalled();
    },
  );

  it.each(['file:///photos/soup.jpg', 'https://example.com/soup.jpg'])(
    'opens %s without another native modal and preserves expiry edits when Back closes only the photo',
    async uri => {
      await render({ ...item, imageUrl: uri });
      await press('product-expiry-remove');
      await press('product-details-photo-preview');

      expect(renderer!.root.findAllByType(Modal)).toHaveLength(1);
      expect(
        renderer!.root.findByProps({ testID: 'product-photo-preview-image' })
          .props,
      ).toMatchObject({
        source: { uri },
        resizeMode: 'contain',
      });
      expect(isOpen()).toBe(true);
      expect(dismissKeyboard).toHaveBeenCalledTimes(1);
      expect(onSave).not.toHaveBeenCalled();

      await back();
      expect(isOpen()).toBe(false);
      expect(onClose).not.toHaveBeenCalled();
      await press('product-details-save');
      expect(onSave).toHaveBeenCalledWith({ expiryDate: null, openedAt: null });
      await back();
      expect(onClose).toHaveBeenCalledTimes(1);
    },
  );

  it('shows a recoverable image error and resets loading state when reopened', async () => {
    await render(item);
    await press('product-details-photo-preview');
    await act(async () =>
      renderer!.root
        .findByProps({ testID: 'product-photo-preview-image' })
        .props.onError(),
    );
    expect(
      renderer!.root
        .findAllByType(Text)
        .some(text => text.props.children === 'Nie udało się wczytać zdjęcia.'),
    ).toBe(true);
    expect(onClose).not.toHaveBeenCalled();

    await press('product-photo-preview-close');
    expect(isOpen()).toBe(false);
    await press('product-details-photo-preview');
    expect(
      renderer!.root.findByProps({ testID: 'product-photo-preview-image' })
        .props.source.uri,
    ).toBe(item.imageUrl);
    await act(async () =>
      renderer!.root
        .findByProps({ testID: 'product-photo-preview-image' })
        .props.onLoadEnd(),
    );
    expect(
      renderer!.root.findAllByProps({ accessibilityLabel: 'Wczytuję zdjęcie' }),
    ).toHaveLength(0);
  });

  it('closes a stale preview when the product or URI changes and does not reopen it on returning', async () => {
    await render(item);
    await press('product-details-photo-preview');
    await render({ ...item, id: 'another-item' });
    expect(isOpen()).toBe(false);
    await render(item);
    expect(isOpen()).toBe(false);

    await press('product-details-photo-preview');
    await render({ ...item, imageUrl: 'file:///photos/replacement.jpg' });
    expect(isOpen()).toBe(false);
    await press('product-details-photo-preview');
    expect(
      renderer!.root.findByProps({ testID: 'product-photo-preview-image' })
        .props.source.uri,
    ).toBe('file:///photos/replacement.jpg');

    await render(null);
    await render(item);
    expect(isOpen()).toBe(false);
  });

  it('keeps the missing-photo placeholder non-interactive', async () => {
    await render({ ...item, imageUrl: undefined });
    expect(
      renderer!.root.findAllByProps({
        testID: 'product-details-photo-preview',
      }),
    ).toHaveLength(0);
    expect(isOpen()).toBe(false);
  });
});
