import type { Slot } from './types';

export const SHOP_TIME_ZONE = 'America/Chicago';
export const INITIAL_TIMES_PER_PERIOD = 4;

export const chicagoDate = (date = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: SHOP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(date);

export const addDays = (date: string, amount: number) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
};

export const prettyDate = (date: string, long = false) => new Intl.DateTimeFormat('en-US', {
  weekday: long ? 'long' : 'short',
  month: long ? 'long' : 'short',
  day: 'numeric',
  timeZone: 'UTC',
}).format(new Date(`${date}T12:00:00Z`));

export const prettyDateTime = (epoch: number) => new Intl.DateTimeFormat('en-US', {
  timeZone: SHOP_TIME_ZONE,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
}).format(epoch * 1000);

export const prettyTime = (epoch: number) => new Intl.DateTimeFormat('en-US', {
  timeZone: SHOP_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
}).format(epoch * 1000);

export const slotDate = (epoch: number) => chicagoDate(new Date(epoch * 1000));

function localMinute(epoch: number) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: SHOP_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(epoch * 1000)).map((part) => [part.type, part.value]));
  return Number(parts.hour) * 60 + Number(parts.minute);
}

export type DayPeriod = 'Morning' | 'Afternoon' | 'Evening';

export function periodForSlot(slot: Slot): DayPeriod {
  const minute = localMinute(slot.start);
  if (minute < 720) return 'Morning';
  if (minute < 1020) return 'Afternoon';
  return 'Evening';
}

export function curateSlots(slots: Slot[]) {
  if (slots.length <= 1) return slots;
  const first = slots[0];
  const curated = slots.filter((slot, index) => index === 0 || localMinute(slot.start) % 15 === 0);
  if (!curated.some((slot) => slot.start === first.start && slot.barberId === first.barberId)) curated.unshift(first);
  return curated;
}

export function groupSlots(slots: Slot[]) {
  const groups: Record<DayPeriod, Slot[]> = { Morning: [], Afternoon: [], Evening: [] };
  for (const slot of curateSlots(slots)) groups[periodForSlot(slot)].push(slot);
  return groups;
}

export function normalizeUsPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return '';
}

export function formatUsPhone(value: string) {
  const normalized = normalizeUsPhone(value);
  if (!normalized) return value;
  const digits = normalized.slice(2);
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
