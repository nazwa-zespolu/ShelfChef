import {
  PhotoZoom,
  type PhotoTouch,
  type PhotoTransform,
} from '../components/photoZoom';

const touch = (x: number, y: number, id = 1): PhotoTouch => ({ x, y, id });

describe('Product photo zoom gestures', () => {
  let zoom: PhotoZoom;
  let current: PhotoTransform;
  const tap = (x: number, y: number, time: number) => {
    zoom.begin([touch(x, y)], time);
    zoom.release(time + 30);
  };
  const doubleTap = (x = 150, y = 200) => {
    tap(x, y, 0);
    tap(x, y, 100);
  };

  beforeEach(() => {
    zoom = new PhotoZoom(next => {
      current = next;
    });
    zoom.setViewport({ width: 300, height: 400 });
    zoom.setImage({ width: 600, height: 800 });
  });

  it('zooms around the pinch midpoint and follows its movement', () => {
    zoom.begin([touch(50, 100), touch(150, 100, 2)], 0);
    zoom.move([touch(0, 100), touch(200, 100, 2)]);
    expect(current).toEqual({ scale: 2, x: 50, y: 100 });
    zoom.move([touch(20, 130), touch(220, 130, 2)]);
    expect(current).toEqual({ scale: 2, x: 70, y: 130 });
  });

  it('clamps pinch zoom between the whole image and four times its fitted size', () => {
    zoom.begin([touch(100, 200), touch(200, 200, 2)], 0);
    zoom.move([touch(-350, 200), touch(650, 200, 2)]);
    expect(current.scale).toBe(4);
    zoom.move([touch(149, 200), touch(151, 200, 2)]);
    expect(current).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it.each([
    [
      { width: 600, height: 1200 },
      { x: 50, y: 200 },
    ],
    [
      { width: 1200, height: 600 },
      { x: 150, y: 0 },
    ],
  ])(
    'constrains dragging to the actual bounds of a fitted %j photo',
    (size, bounds) => {
      zoom.setImage(size);
      doubleTap();
      zoom.begin([touch(150, 200)], 300);
      zoom.move([touch(1150, 1200)]);
      expect(current).toEqual({ scale: 2, ...bounds });
      zoom.move([touch(-850, -800)]);
      expect(current.x).toBe(bounds.x === 0 ? 0 : -bounds.x);
      expect(current.y).toBe(bounds.y === 0 ? 0 : -bounds.y);
    },
  );

  it('keeps the entire photo centered when dragging at its original scale', () => {
    zoom.begin([touch(100, 100)], 0);
    zoom.move([touch(300, 300)]);
    expect(current).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it('rebases pinch-to-pan and pan-to-pinch transitions without a jump', () => {
    zoom.begin([touch(100, 200), touch(200, 200, 2)], 0);
    zoom.move([touch(50, 200), touch(250, 200, 2)]);
    zoom.rebase([touch(250, 200, 2)]);
    zoom.move([touch(290, 250, 2)]);
    expect(current).toEqual({ scale: 2, x: 40, y: 50 });
    zoom.rebase([touch(290, 250, 2), touch(190, 250, 3)]);
    zoom.move([touch(190, 250, 3), touch(290, 250, 2)]);
    expect(current).toEqual({ scale: 2, x: 40, y: 50 });
    zoom.release(200);
    tap(150, 200, 220);
    expect(current.scale).toBe(2);
  });

  it('zooms toward a double tap and restores the whole photo on the next double tap', () => {
    doubleTap(100, 100);
    expect(current).toEqual({ scale: 2, x: 50, y: 100 });
    tap(100, 100, 300);
    tap(100, 100, 400);
    expect(current).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it('does not mistake distant taps, a drag or a long press for a double tap', () => {
    tap(50, 50, 0);
    tap(250, 350, 100);
    expect(current.scale).toBe(1);
    zoom.begin([touch(250, 350)], 200);
    zoom.move([touch(200, 300)]);
    zoom.release(250);
    tap(200, 300, 300);
    expect(current.scale).toBe(1);
    zoom.begin([touch(200, 300)], 400);
    zoom.release(700);
    tap(200, 300, 750);
    expect(current.scale).toBe(1);
  });

  it('handles coincident fingers and ignores an interrupted tap', () => {
    zoom.begin([touch(150, 200), touch(150, 200, 2)], 0);
    zoom.move([touch(140, 200), touch(160, 200, 2)]);
    expect(current).toEqual({ scale: 1, x: 0, y: 0 });
    zoom.move([touch(130, 200), touch(170, 200, 2)]);
    expect(current.scale).toBe(2);
    zoom.cancel();
    tap(150, 200, 100);
    zoom.begin([touch(150, 200)], 150);
    zoom.cancel();
    tap(150, 200, 200);
    expect(current.scale).toBe(2);
  });

  it('resets zoom and tap history on viewport or image changes', () => {
    doubleTap();
    zoom.setViewport({ width: 400, height: 300 });
    expect(current).toEqual({ scale: 1, x: 0, y: 0 });
    doubleTap(200, 150);
    zoom.setImage({ width: 1200, height: 600 });
    expect(current).toEqual({ scale: 1, x: 0, y: 0 });
    tap(200, 150, 150);
    expect(current.scale).toBe(1);
    zoom.setImage({ width: 0, height: 0 });
    expect(zoom.ready).toBe(false);
  });
});
