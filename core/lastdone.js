// Last done (Tools page; Scott, 25/11/2026): when something was last done and,
// optionally, how often it should be done. Saved in settings.data.lastDone as
// [{ id, title, every (days or null), dates: ['YYYY-MM-DD', ...] newest first,
// up to 10 }], with a copy on this device for a fast start. Due on the day the
// interval runs out (amber), overdue after that (red).
import { getSettings, updateSettings } from './wellbeing.js';
import { todayKey } from './date.js';
import { daysBetween } from './keydates.js';

const KEY = 'sf-lastdone';
const HISTORY = 10;
const isKey = (k) => /^\d{4}-\d{2}-\d{2}$/.test(k);
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

const clean = (list) => (Array.isArray(list) ? list : [])
  .filter((x) => x && x.id && x.title)
  .map((x) => ({
    id: String(x.id),
    title: String(x.title).slice(0, 60),
    every: Number(x.every) > 0 ? Math.min(3650, Math.round(Number(x.every))) : null,
    dates: [...new Set((x.dates || []).filter(isKey))].sort().reverse().slice(0, HISTORY),
  }))
  .filter((x) => x.dates.length);

// Facts about one item today: days since, days left (null without an interval), state.
export function info(x, today = todayKey()) {
  const since = daysBetween(x.dates[0], today);
  const left = x.every ? x.every - since : null;
  const state = left === null ? 'none' : left < 0 ? 'overdue' : left === 0 ? 'due' : 'ok';
  return { since, left, state };
}

// Overdue first (most overdue at the top), then by days left, then items without an interval.
export function sorted(list, today = todayKey()) {
  const rank = (x) => { const i = info(x, today); return i.left === null ? 1e9 : i.left; };
  return clean(list).sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));
}

export function cachedLastDone() {
  try { return sorted(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { return []; }
}

function keep(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage full */ }
}

export async function listLastDone() {
  const list = sorted((await getSettings()).lastDone);
  keep(list);
  return list;
}

// Reads the latest copy first so a change on another device is not lost.
async function change(fn) {
  const list = sorted(fn(clean((await getSettings()).lastDone)));
  await updateSettings({ lastDone: list });
  keep(list);
  return list;
}

export const addItem = (title, every, date) => change((l) => [...l, { id: newId(), title: title.trim(), every, dates: [date] }]);
// Editing the date replaces the latest entry; the rest of the history stays.
export const editItem = (id, title, every, date) => change((l) => l.map((x) => (x.id === id
  ? { ...x, title: title.trim(), every, dates: [date, ...x.dates.slice(1)] } : x)));
export const markDone = (id, date = todayKey()) => change((l) => l.map((x) => (x.id === id ? { ...x, dates: [date, ...x.dates] } : x)));
export const deleteItem = (id) => change((l) => l.filter((x) => x.id !== id));

export const sinceText = (n) => (n <= 0 ? 'Today' : n === 1 ? 'Yesterday' : `${n} days ago`);

export function dueText({ left, state }) {
  if (state === 'none') return '';
  if (state === 'overdue') return `Overdue by ${-left} day${left === -1 ? '' : 's'}`;
  if (state === 'due') return 'Due today';
  return left === 1 ? 'Due tomorrow' : `Due in ${left} days`;
}

// Tile status line.
export function lastDoneStatus(list) {
  if (!list.length) return 'Track when you last did things';
  const first = list[0];
  const i = info(first);
  if (i.state === 'overdue' || i.state === 'due') {
    const n = list.filter((x) => ['overdue', 'due'].includes(info(x).state)).length;
    return n > 1 ? `${n} things due` : `${first.title}: ${dueText(i).toLowerCase()}`;
  }
  if (i.state === 'ok') return `Next: ${first.title} ${i.left === 1 ? 'tomorrow' : `in ${i.left} days`}`;
  return `${first.title}: ${sinceText(i.since).toLowerCase()}`;
}

export const dueNow = (list) => list.filter((x) => ['overdue', 'due'].includes(info(x).state));
