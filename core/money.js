// Money data: categories, recurring payments, due dates, renewals and alerts.
// Never store bank account numbers, sort codes or card numbers.
import { supabase } from './supabase.js';
import { todayKey } from './date.js';
import { getSettings, updateSettings } from './wellbeing.js';
import { daysBetween, formatKey } from './keydates.js';

export const SEED_CATEGORIES = ['Housing', 'Council tax', 'Utilities', 'Phone & broadband', 'Insurance',
  'Streaming', 'Subscriptions', 'Transport', 'Loans & credit', 'Savings', 'Other'];

export const FREQUENCIES = [['weekly', 'Weekly'], ['monthly', 'Monthly'], ['quarterly', 'Quarterly'], ['annual', 'Annual']];
export const TYPES = [['direct_debit', 'Direct debit'], ['standing_order', 'Standing order'], ['card_subscription', 'Card subscription']];
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const label = (list, v) => (list.find(([k]) => k === v) || [, ''])[1];

const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
export const money = (n) => gbp.format(Number(n) || 0);

// ---------- Categories ----------

export async function listCategories() {
  const { data, error } = await supabase.from('categories').select('*').order('sort').order('name');
  if (error) throw error;
  if (data.length) return data;
  const settings = await getSettings();
  if (settings.categoriesSeeded) return data;
  const { data: seeded, error: e2 } = await supabase.from('categories')
    .insert(SEED_CATEGORIES.map((name, i) => ({ name, sort: i }))).select();
  if (e2) throw e2;
  await updateSettings({ categoriesSeeded: true });
  return seeded.sort((a, b) => a.sort - b.sort);
}
export async function addCategory(name, sort) {
  const { error } = await supabase.from('categories').insert({ name, sort });
  if (error) throw error;
}
export async function renameCategory(id, name) {
  const { error } = await supabase.from('categories').update({ name }).eq('id', id);
  if (error) throw error;
}
export async function deleteCategory(id) {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) throw error;
}

// ---------- Payments ----------

export async function listPayments() {
  const { data, error } = await supabase.from('payments').select('*').order('provider');
  if (error) throw error;
  return data || [];
}
export async function savePayment(fields, id) {
  const q = id ? supabase.from('payments').update(fields).eq('id', id) : supabase.from('payments').insert(fields);
  const { error } = await q;
  if (error) throw error;
}
export async function deletePayment(id) {
  const { error } = await supabase.from('payments').delete().eq('id', id);
  if (error) throw error;
}

// ---------- Date maths (YYYY-MM-DD keys) ----------

const parse = (k) => k.split('-').map(Number);
const mk = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const dim = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const addDays = (k, n) => { const [y, m, d] = parse(k); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const addMonths = (k, n, day) => {
  const [y, m, d] = parse(k);
  const t = y * 12 + (m - 1) + n;
  const ny = Math.floor(t / 12);
  const nm = (t % 12) + 1;
  return mk(ny, nm, Math.min(day || d, dim(ny, nm)));
};
const weekday = (k) => { const [y, m, d] = parse(k); return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1; }; // Mon=1

// Next date the payment leaves, on or after `today`, or null if unknown.
// Weekly: payment_day is the weekday (1 Mon to 7 Sun). Monthly: day of month
// (31 means the last day). Quarterly and annual: every 3 or 12 months from
// the start date (payment_day, if set, overrides the day of the month).
export function nextDue(p, today = todayKey()) {
  if (p.frequency === 'weekly') {
    const wd = p.payment_day || (p.start_date && weekday(p.start_date));
    if (!wd) return null;
    return addDays(today, (wd - weekday(today) + 7) % 7);
  }
  if (p.frequency === 'monthly') {
    const day = p.payment_day || (p.start_date && parse(p.start_date)[2]);
    if (!day) return null;
    const [y, m] = parse(today);
    const thisMonth = mk(y, m, Math.min(day, dim(y, m)));
    return thisMonth >= today ? thisMonth : addMonths(mk(y, m, 1), 1, day);
  }
  const step = p.frequency === 'quarterly' ? 3 : 12;
  if (!p.start_date) return null;
  const day = p.payment_day || parse(p.start_date)[2];
  let i = 0;
  let k = addMonths(p.start_date, 0, day);
  while (k < today && i < 1000) k = addMonths(p.start_date, step * ++i, day);
  return k;
}

// Parses "30 days", "1 month", "2 weeks", "3 months' notice". Returns null if unclear.
export function parseNotice(text) {
  const m = String(text || '').match(/(\d+)\s*(day|week|month|year)/i);
  if (!m) return null;
  return { n: Number(m[1]), unit: m[2].toLowerCase() };
}

// Last day to give notice before the end or renewal date, or null.
export function cancelBy(p) {
  const n = parseNotice(p.notice_period);
  if (!p.end_date || !n) return null;
  if (n.unit === 'day') return addDays(p.end_date, -n.n);
  if (n.unit === 'week') return addDays(p.end_date, -7 * n.n);
  return addMonths(p.end_date, -(n.unit === 'year' ? 12 : 1) * n.n);
}

export const whenText = (days) => (days === 0 ? 'today' : days === 1 ? 'tomorrow' : days > 1 ? `in ${days} days` : `${-days} day${days === -1 ? '' : 's'} ago`);

// ---------- Alerts ----------

// Payments leaving in the next 7 days (today included), soonest first.
export function dueSoon(payments, today = todayKey(), within = 7) {
  return payments
    .map((p) => ({ p, date: nextDue(p, today) }))
    .filter((x) => x.date && daysBetween(today, x.date) < within)
    .map((x) => ({ ...x, days: daysBetween(today, x.date) }))
    .sort((a, b) => a.days - b.days || a.p.provider.localeCompare(b.p.provider));
}

// Renewals, expiries and cancel-by dates in the next 30 days.
export function renewalsSoon(payments, today = todayKey(), within = 30) {
  const out = [];
  for (const p of payments) {
    if (p.end_date) {
      const d = daysBetween(today, p.end_date);
      if (d >= 0 && d <= within) out.push({ p, kind: 'renews', date: p.end_date, days: d });
    }
    const cb = cancelBy(p);
    if (cb) {
      const d = daysBetween(today, cb);
      if (d >= 0 && d <= within) out.push({ p, kind: 'cancel_by', date: cb, days: d });
    }
  }
  return out.sort((a, b) => a.days - b.days);
}

export function alertText(a) {
  const name = a.p.provider;
  return a.kind === 'cancel_by'
    ? `${name}: cancel by ${formatKey(a.date)} (${whenText(a.days)}) if not renewing`
    : `${name} renews or ends ${formatKey(a.date)} (${whenText(a.days)})`;
}

// Quiet Home line, no amounts. e.g. "3 payments due this week · Netflix renews in 12 days"
export function quietFinanceText(payments, today = todayKey()) {
  const parts = [];
  const due = dueSoon(payments, today);
  if (due.length) parts.push(`${due.length} payment${due.length === 1 ? '' : 's'} due this week`);
  const ren = renewalsSoon(payments, today);
  if (ren.length) {
    const r = ren[0];
    parts.push(r.kind === 'cancel_by'
      ? `${r.p.provider} cancel-by ${whenText(r.days)}`
      : `${r.p.provider} renews ${whenText(r.days)}`);
    if (ren.length > 1) parts.push(`${ren.length - 1} more renewal${ren.length === 2 ? '' : 's'}`);
  }
  return parts.join(' · ');
}

// ---------- Safety check: no bank or card numbers ----------

function luhn(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

// Returns a warning if any text looks like a sort code or card number.
export function sensitiveNumberWarning(fields, labels = {}) {
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v !== 'string' || !v) continue;
    const name = labels[k] || k;
    if (/\b\d{2}[- ]\d{2}[- ]\d{2}\b/.test(v)) return `"${name}" looks like it contains a sort code.`;
    for (const run of v.replace(/[ -]/g, '').match(/\d{13,19}/g) || []) {
      if (luhn(run)) return `"${name}" looks like it contains a card number.`;
    }
    if (k === 'bank_name' && /\d{4,}/.test(v)) return 'Bank should be the bank name only, with no numbers.';
  }
  return null;
}
