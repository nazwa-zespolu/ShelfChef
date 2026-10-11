import {InventoryItem} from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

export const EXPIRING_SOON_DAYS = 2;

export type ExpiryStatus = 'expired' | 'today' | 'tomorrow' | 'soon';

export type ExpiryUrgency = {
  status: ExpiryStatus;
  daysRemaining: number;
};

function parseExpiryDay(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return Math.floor(date.getTime() / DAY_MS);
}

function getLocalDay(date: Date): number | null {
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS,
  );
}

function getDaysRemaining(expiryDate: string | null, now: Date): number | null {
  const expiryDay = parseExpiryDay(expiryDate);
  const currentDay = getLocalDay(now);
  if (expiryDay == null || currentDay == null) {
    return null;
  }
  return expiryDay - currentDay;
}

export function getExpiryUrgency(
  expiryDate: string | null,
  now: Date = new Date(),
): ExpiryUrgency | null {
  const daysRemaining = getDaysRemaining(expiryDate, now);
  if (daysRemaining == null) {
    return null;
  }
  if (daysRemaining > EXPIRING_SOON_DAYS) {
    return null;
  }

  if (daysRemaining < 0) {
    return {status: 'expired', daysRemaining};
  }
  if (daysRemaining === 0) {
    return {status: 'today', daysRemaining};
  }
  if (daysRemaining === 1) {
    return {status: 'tomorrow', daysRemaining};
  }
  return {status: 'soon', daysRemaining};
}

export function getExpiringProducts(
  items: readonly InventoryItem[],
  now: Date = new Date(),
): InventoryItem[] {
  return items
    .map(item => ({item, urgency: getExpiryUrgency(item.expiryDate, now)}))
    .filter(
      (entry): entry is {item: InventoryItem; urgency: ExpiryUrgency} =>
        entry.urgency != null,
    )
    .sort((a, b) => a.urgency.daysRemaining - b.urgency.daysRemaining)
    .map(entry => entry.item);
}
