// Date helpers. Everything is worked out in Europe/London time.
import { CONFIG } from '../config.js';

const partsFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: CONFIG.timezone,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', weekday: 'long', hourCycle: 'h23',
});

// Returns { year, month, day, hour, minute, weekday } for London time.
export function londonParts(date = new Date()) {
  const out = {};
  for (const p of partsFmt.formatToParts(date)) out[p.type] = p.value;
  return {
    year: +out.year, month: +out.month, day: +out.day,
    hour: +out.hour, minute: +out.minute, weekday: out.weekday,
  };
}

// YYYY-MM-DD key for today in London, used for storage (resets at 00:00).
export function todayKey(date = new Date()) {
  const p = londonParts(date);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

// DD/MM/YYYY for display.
export function formatDate(date = new Date()) {
  const p = londonParts(date);
  return `${String(p.day).padStart(2, '0')}/${String(p.month).padStart(2, '0')}/${p.year}`;
}

// Friendly form for the Home header, e.g. "Friday 6 November".
const friendlyFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: CONFIG.timezone, weekday: 'long', day: 'numeric', month: 'long',
});
export function friendlyDate(date = new Date()) {
  return friendlyFmt.format(date).replace(',', '');
}

export function greeting(date = new Date()) {
  const h = londonParts(date).hour;
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
