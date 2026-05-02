import {InventoryItem} from '../domain/types';

export function formatExpiryLine(iso: string): string {
  if (!iso) {
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

export function compareExpiry(a: InventoryItem, b: InventoryItem): number {
  const ta = new Date(a.expiryDate).getTime();
  const tb = new Date(b.expiryDate).getTime();
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

