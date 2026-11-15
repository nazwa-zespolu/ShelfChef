export type PhotoPoint = { x: number; y: number };
export type PhotoTouch = PhotoPoint & { id: string | number };
export type PhotoSize = { width: number; height: number };
export type PhotoTransform = PhotoPoint & { scale: number };

const INITIAL_TRANSFORM: PhotoTransform = { scale: 1, x: 0, y: 0 };
const MAX_SCALE = 4;
const TAP_SLOP = 8;
const DOUBLE_TAP_SLOP = 24;
const TAP_DURATION = 250;
const DOUBLE_TAP_DELAY = 300;
const distance = (a: PhotoPoint, b: PhotoPoint) =>
  Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (points: PhotoTouch[]): PhotoPoint =>
  points.length === 1
    ? points[0]
    : {
        x: (points[0].x + points[1].x) / 2,
        y: (points[0].y + points[1].y) / 2,
      };

// Geometry and gesture state are independent of React Native's event delivery.
export class PhotoZoom {
  private viewport: PhotoSize = { width: 0, height: 0 };
  private image: PhotoSize = { width: 0, height: 0 };
  private transform = { ...INITIAL_TRANSFORM };
  private anchor: { touches: PhotoTouch[]; transform: PhotoTransform } | null =
    null;
  private tap: { point: PhotoPoint; time: number } | null = null;
  private previousTap: { point: PhotoPoint; time: number } | null = null;

  constructor(private readonly onChange: (transform: PhotoTransform) => void) {}

  get ready() {
    return (
      this.viewport.width > 0 &&
      this.viewport.height > 0 &&
      this.image.width > 0 &&
      this.image.height > 0
    );
  }

  setViewport(size: PhotoSize) {
    if (
      size.width !== this.viewport.width ||
      size.height !== this.viewport.height
    ) {
      this.viewport = size;
      this.reset();
    }
  }

  setImage(size: PhotoSize) {
    this.image = size;
    this.reset();
  }

  private reset() {
    this.cancel();
    this.apply(INITIAL_TRANSFORM);
  }

  private apply(next: PhotoTransform) {
    const scale = Math.max(1, Math.min(MAX_SCALE, next.scale));
    const fit = this.ready
      ? Math.min(
          this.viewport.width / this.image.width,
          this.viewport.height / this.image.height,
        )
      : 0;
    const limitX = Math.max(
      0,
      (this.image.width * fit * scale - this.viewport.width) / 2,
    );
    const limitY = Math.max(
      0,
      (this.image.height * fit * scale - this.viewport.height) / 2,
    );
    this.transform = {
      scale,
      x: limitX > 0 ? Math.max(-limitX, Math.min(limitX, next.x)) : 0,
      y: limitY > 0 ? Math.max(-limitY, Math.min(limitY, next.y)) : 0,
    };
    this.onChange(this.transform);
  }

  begin(touches: PhotoTouch[], time: number) {
    if (!this.ready || touches.length === 0) {
      return;
    }
    this.tap = touches.length === 1 ? { point: touches[0], time } : null;
    this.rebase(touches);
  }

  rebase(touches: PhotoTouch[]) {
    if (touches.length === 0) {
      return;
    }
    if (touches.length > 1) {
      this.tap = null;
      this.previousTap = null;
    }
    this.anchor = { touches: touches.slice(0, 2), transform: this.transform };
  }

  move(touches: PhotoTouch[]) {
    if (!this.ready || touches.length === 0) {
      return;
    }
    const anchor = this.anchor;
    const points = touches.slice(0, 2);
    if (
      !anchor ||
      anchor.touches.length !== points.length ||
      anchor.touches.some(touch => !points.some(point => point.id === touch.id))
    ) {
      this.rebase(touches);
      return;
    }
    if (this.tap && distance(this.tap.point, points[0]) > TAP_SLOP) {
      this.tap = null;
      this.previousTap = null;
    }
    const start = midpoint(anchor.touches);
    const current = midpoint(points);
    const initialDistance =
      points.length > 1 ? distance(anchor.touches[0], anchor.touches[1]) : 0;
    if (points.length > 1 && initialDistance < 1) {
      this.rebase(touches);
      return;
    }
    const scale =
      points.length === 1
        ? anchor.transform.scale
        : Math.max(
            1,
            Math.min(
              MAX_SCALE,
              (anchor.transform.scale * distance(points[0], points[1])) /
                initialDistance,
            ),
          );
    const ratio = scale / anchor.transform.scale;
    this.apply({
      scale,
      x:
        current.x -
        this.viewport.width / 2 -
        (start.x - this.viewport.width / 2 - anchor.transform.x) * ratio,
      y:
        current.y -
        this.viewport.height / 2 -
        (start.y - this.viewport.height / 2 - anchor.transform.y) * ratio,
    });
  }

  release(time: number) {
    const tap = this.tap;
    const previous = this.previousTap;
    this.anchor = null;
    this.tap = null;
    if (!tap || time - tap.time > TAP_DURATION) {
      this.previousTap = null;
      return;
    }
    if (
      previous &&
      time - previous.time <= DOUBLE_TAP_DELAY &&
      distance(tap.point, previous.point) <= DOUBLE_TAP_SLOP
    ) {
      this.previousTap = null;
      const scale = this.transform.scale > 1 ? 1 : 2;
      this.apply({
        scale,
        x: (this.viewport.width / 2 - tap.point.x) * (scale - 1),
        y: (this.viewport.height / 2 - tap.point.y) * (scale - 1),
      });
    } else {
      this.previousTap = { point: tap.point, time };
    }
  }

  cancel() {
    this.anchor = null;
    this.tap = null;
    this.previousTap = null;
  }
}
