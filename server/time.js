// Sana va vaqt: hammasi mahalliy vaqtda (Toshkent), sanalar 'YYYY-MM-DD' satr ko'rinishida.
import { PERIODS, periodAt, toMin } from '../public/shared/scenarios.js';

const DAY_MS = 86_400_000;

/** Mahalliy hozirgi vaqt: { date: '2026-10-06', minutes: 640, time: '10:40', period } */
export function localNow(offsetMinutes, now = Date.now()) {
  const iso = new Date(now + offsetMinutes * 60_000).toISOString();
  const minutes = Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));
  return { date: iso.slice(0, 10), minutes, time: iso.slice(11, 16), period: periodAt(minutes) };
}

export function isDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
}

export const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** Kalendar oyi qo'shish: 31-yanvar + 1 oy = 28/29-fevral */
export function addMonths(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, lastDay));
  return first.toISOString().slice(0, 10);
}

/** Bronning oxirgi kuni (shu kun ham kiradi) */
export function endDateFor(start, unit, qty) {
  if (unit === 'oy') return addDays(addMonths(start, qty), -1);
  if (unit === 'kun') return addDays(start, qty - 1);
  return start;
}

/**
 * Davr qaysi sanaga tegishli. Tun yarim tundan o'tadi:
 * soat 02:00 dagi tun — kechagi sananing tuni.
 */
export function periodDate(period, now) {
  if (period === 'night' && now.minutes < toMin(PERIODS.night.to)) return addDays(now.date, -1);
  return now.date;
}
