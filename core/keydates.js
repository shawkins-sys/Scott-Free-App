// Key dates: birthdays (repeat yearly) and life admin (MOT, car tax etc.).
// Used by the Plan hub, the calendar views and the quiet Home line.
import { supabase } from './supabase.js';
import { todayKey } from './date.js';
import { esc } from './wellbeing.js';

export const DEFAULT_LEAD = { birthday: 7, life_admin: 30 };

export async function listKeyDates() {
  const { data, error } = await supabase.from('key_dates').select('*').order('due_date');
  if (error) throw error;
  return data || [];
}
export async function saveKeyDate(fields, id) {
  const q = id
    ? supabase.from('key_dates').update(fields).eq('id', id)
    : supabase.from('key_dates').insert(fields);
  const { error } = await q;
  if (error) throw error;
}
export async function deleteKeyDate(id) {
  const { error } = await supabase.from('key_dates').delete().eq('id', id);
  if (error) throw error;
}

// ---------- Date maths on YYYY-MM-DD keys ----------

const parse = (k) => k.split('-').map(Number);
const key = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function daysBetween(a, b) {
  const [y1, m1, d1] = parse(a);
  const [y2, m2, d2] = parse(b);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

// Adds months, keeping the day where possible (31 Jan + 1 month = 28/29 Feb).
function addMonths(k, n) {
  const [y, m, d] = parse(k);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return key(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

export const formatKey = (k) => { const [y, m, d] = parse(k); return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`; };

// Next date an item falls on, on or after today.
// Birthdays roll yearly by themselves. Life admin stays on its due date
// (and shows as overdue) until marked Done.
export function nextDate(item, today = todayKey()) {
  if (item.kind !== 'birthday') return item.due_date;
  const [, m, d] = parse(item.due_date);
  const [ty] = parse(today);
  for (const y of [ty, ty + 1]) {
    const k = key(y, m, Math.min(d, daysInMonth(y, m))); // 29 Feb shows on 28 Feb
    if (k >= today) return k;
  }
  return item.due_date;
}

// The due date after marking a life admin item Done, or null if it does not repeat.
export function advancedDate(item, today = todayKey()) {
  const n = Math.max(1, item.repeat_every || 1);
  const months = { yearly: 12, every_n_months: n, every_n_years: 12 * n }[item.repeat_rule];
  if (!months) return null;
  // Count steps from the original due date so month-ends do not drift.
  let i = 1;
  let k = addMonths(item.due_date, months);
  while (k <= today && i < 500) k = addMonths(item.due_date, months * ++i);
  return k;
}

export const leadDays = (item) => Math.max(0, ...(item.lead_days || [0]));

export function displayTitle(item) {
  if (item.kind !== 'birthday') return item.title;
  return `${item.title}'s birthday`;
}

// "in 5 days", "tomorrow", "today", "overdue by 3 days"
export function whenText(days) {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days > 1) return `in ${days} days`;
  return `overdue by ${-days} day${days === -1 ? '' : 's'}`;
}

export function ageOn(item, k) {
  if (item.kind !== 'birthday' || !item.birth_year) return null;
  return parse(k)[0] - item.birth_year;
}

// Items inside their reminder window (or overdue), soonest first.
export function upcoming(items, today = todayKey()) {
  return items
    .map((item) => ({ item, date: nextDate(item, today) }))
    .map((x) => ({ ...x, days: daysBetween(today, x.date) }))
    .filter((x) => x.days <= leadDays(x.item) && (x.days >= 0 || x.item.kind === 'life_admin'))
    .sort((a, b) => a.days - b.days);
}

// Key dates falling on a given day, as list rows for the calendar views.
export function keyDateRows(items, dayKey, today = todayKey()) {
  return items
    .filter((item) => nextDate(item, today) === dayKey)
    .map((item) => {
      const age = ageOn(item, dayKey);
      return `
        <li class="ev kd">
          <a class="ev-btn" href="#/hub/plan">
            <span class="ev-time">${item.kind === 'birthday' ? 'Birthday' : 'Life admin'}</span>
            <span class="ev-title">${esc(displayTitle(item))}${age ? ` (${age})` : ''}</span>
          </a>
        </li>`;
    }).join('');
}

// Quiet Home line: up to three items, e.g. "Mum's birthday in 5 days · MOT in 12 days".
export function quietLineText(items, today = todayKey()) {
  const list = upcoming(items, today).slice(0, 3);
  return list.map(({ item, days }) => `${displayTitle(item)} ${whenText(days)}`).join(' · ');
}
