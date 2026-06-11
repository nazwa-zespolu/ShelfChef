import {InventoryItem} from '../domain/types';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function formatExpiryLine(iso: string | null): string {
  if (iso == null || iso === '') {
    return '—';
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return d.toLocaleDateString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatOpenedDateTime(iso: string | null | undefined): string | null {
  if (iso == null || iso === '') {
    return null;
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  return d.toLocaleString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatOpenedDuration(
  iso: string | null | undefined,
  now: Date = new Date(),
): string | null {
  if (iso == null || iso === '') {
    return null;
  }
  const opened = new Date(iso);
  if (Number.isNaN(opened.getTime())) {
    return null;
  }
  const elapsed = Math.max(0, now.getTime() - opened.getTime());
  if (elapsed < HOUR_MS) {
    const minutes = Math.max(1, Math.floor(elapsed / MINUTE_MS));
    return `${minutes} min`;
  }
  if (elapsed < DAY_MS) {
    const hours = Math.floor(elapsed / HOUR_MS);
    return `${hours} godz.`;
  }
  const days = Math.floor(elapsed / DAY_MS);
  return `${days} dni`;
}

export function formatOpenedLine(
  item: Pick<InventoryItem, 'isOpened' | 'openedAt'>,
  now: Date = new Date(),
): string | null {
  if (!item.isOpened) {
    return null;
  }
  const duration = formatOpenedDuration(item.openedAt, now);
  const dateTime = formatOpenedDateTime(item.openedAt);
  if (!duration || !dateTime) {
    return 'Otwarte · brak daty';
  }
  return `Otwarte od ${duration} · ${dateTime}`;
}

export function compareExpiry(a: InventoryItem, b: InventoryItem): number {
  const ta = a.expiryDate ? new Date(a.expiryDate).getTime() : Number.NaN;
  const tb = b.expiryDate ? new Date(b.expiryDate).getTime() : Number.NaN;
  const aOk = !Number.isNaN(ta);
  const bOk = !Number.isNaN(tb);
  if (aOk && bOk) {
    return ta - tb;
  }
  if (aOk) {
    return -1;
  }
  if (bOk) {
    return 1;
  }
  return 0;
}
