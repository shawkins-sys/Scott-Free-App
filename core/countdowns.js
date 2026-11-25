// Countdowns (Tools page, phase 2; Scott, 25/11/2026): things to look forward
// to, such as holidays. Saved in settings.data.countdowns as
// [{ id, title, date: 'YYYY-MM-DD' }], with a copy on this device for a fast
// start. A countdown shows "Today" on its day and drops off the day after.
import { getSettings, updateSettings, esc } from './wellbeing.js';
import { todayKey } from './date.js';
import { daysBetween, formatKey, whenText } from './keydates.js';

const KEY = 'sf-countdowns';
export const SOON_DAYS = 7; // shown in Coming up and Home's Up next from this many days before

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

const clean = (list) => (Array.isArray(list) ? list : [])
  .filter((c) => c && c.id && c.title && /^\d{4}-\d{2}-\d{2}$/.test(c.date))
  .map((c) => ({ id: String(c.id), title: String(c.title).slice(0, 60), date: c.date }));

// Upcoming only (today or later), nearest first.
export function upcomingOnly(list, today = todayKey()) {
  return clean(list).filter((c) => c.date >= today).sort((a, b) => a.date.localeCompare(b.date));
}

export function cachedCountdowns() {
  try { return upcomingOnly(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { return []; }
}

function keep(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage full */ }
}

export async function listCountdowns() {
  const d = await getSettings();
  const list = upcomingOnly(d.countdowns);
  keep(list);
  return list;
}

// Reads the latest copy first so a change on another device is not lost.
async function change(fn) {
  const d = await getSettings();
  const list = upcomingOnly(fn(clean(d.countdowns)));
  await updateSettings({ countdowns: list });
  keep(list);
  return list;
}

export const addCountdown = (title, date) => change((l) => [...l, { id: newId(), title: title.trim(), date }]);
export const editCountdown = (id, title, date) => change((l) => l.map((c) => (c.id === id ? { ...c, title: title.trim(), date } : c)));
export const deleteCountdown = (id) => change((l) => l.filter((c) => c.id !== id));

export const daysTo = (c, today = todayKey()) => daysBetween(today, c.date);

// Tile status line, eg "Holiday in 23 days".
export function countdownStatus(list) {
  if (!list.length) return 'Add something to look forward to';
  const c = list[0];
  return `${c.title} ${whenText(daysTo(c))}`;
}

// Rows for the Coming up agenda on one day (same markup as key date rows).
export function countdownRows(list, dayKey) {
  return list.filter((c) => c.date === dayKey).map((c) => `
    <li class="ev kd cdr">
      <a class="ev-btn" href="#/hub/plan">
        <span class="ev-time">Countdown</span>
        <span class="ev-title">${esc(c.title)}</span>
      </a>
    </li>`).join('');
}

export { formatKey };
