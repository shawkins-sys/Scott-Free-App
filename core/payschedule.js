// Pay schedule: paid every 4 weeks on a Friday from the anchor date.
// If a payday is a bank holiday (England and Wales), pay moves to the next
// working day (default) or the working day before, per the setting.
// Any single payday can be overridden.
import { supabase } from './supabase.js';
import { todayKey } from './date.js';
import { getSettings, updateSettings } from './wellbeing.js';

export const PAY_ANCHOR = '2026-11-13';
const CYCLE_DAYS = 28;
const BH_URL = 'https://www.gov.uk/bank-holidays.json';
const BH_CACHE = 'sf-bank-holidays';
const BH_MAX_AGE = 30 * 24 * 3600 * 1000;

// Used if gov.uk cannot be reached. England and Wales, from gov.uk.
const BH_FALLBACK = [
  '2026-01-01', '2026-04-03', '2026-04-06', '2026-05-04', '2026-05-25', '2026-08-31', '2026-12-25', '2026-12-28',
  '2027-01-01', '2027-03-26', '2027-03-29', '2027-05-03', '2027-05-31', '2027-08-30', '2027-12-27', '2027-12-28',
];

const parse = (k) => k.split('-').map(Number);
export const addDays = (k, n) => { const [y, m, d] = parse(k); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const dow = (k) => { const [y, m, d] = parse(k); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }; // 0 Sun

// ---------- Bank holidays ----------

let bhSet = null;

export async function bankHolidays() {
  if (bhSet) return bhSet;
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(BH_CACHE)); } catch { /* ignore */ }
  if (cached && Date.now() - cached.at < BH_MAX_AGE) return (bhSet = new Set(cached.dates));
  try {
    const res = await fetch(BH_URL);
    if (!res.ok) throw new Error(`gov.uk ${res.status}`);
    const data = await res.json();
    const dates = data['england-and-wales'].events.map((e) => e.date);
    try { localStorage.setItem(BH_CACHE, JSON.stringify({ at: Date.now(), dates })); } catch { /* full */ }
    return (bhSet = new Set(dates));
  } catch (err) {
    console.warn('Bank holidays not fetched, using saved list', err);
    return (bhSet = new Set([...(cached ? cached.dates : []), ...BH_FALLBACK]));
  }
}

const isWorkingDay = (k, bh) => { const d = dow(k); return d !== 0 && d !== 6 && !bh.has(k); };

// ---------- Settings ----------

export async function getPaySettings() {
  const s = await getSettings();
  return { holidayRule: 'after', ...(s.pay || {}) };
}
export async function savePaySettings(patch) {
  const current = await getPaySettings();
  await updateSettings({ pay: { ...current, ...patch } });
}

export async function listOverrides() {
  const { data, error } = await supabase.from('payday_overrides').select('*');
  if (error) throw error;
  return new Map((data || []).map((o) => [o.scheduled_date, o.actual_date]));
}
export async function setOverride(scheduled, actual) {
  if (!actual || actual === scheduled) {
    const { error } = await supabase.from('payday_overrides').delete().eq('scheduled_date', scheduled);
    if (error) throw error;
    return;
  }
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('payday_overrides')
    .upsert({ user_id: user.id, scheduled_date: scheduled, actual_date: actual }, { onConflict: 'user_id,scheduled_date' });
  if (error) throw error;
}

// ---------- Paydays ----------

// Scheduled Fridays every 28 days from the anchor, in both directions.
function scheduledOnOrAfter(k) {
  const [y, m, d] = parse(k);
  const [ay, am, ad] = parse(PAY_ANCHOR);
  const diff = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ay, am - 1, ad)) / 86400000);
  return addDays(PAY_ANCHOR, Math.ceil(diff / CYCLE_DAYS) * CYCLE_DAYS);
}

// Loads what is needed to work out paydays: { bh, rule, overrides }.
export async function payContext() {
  const [bh, settings, overrides] = await Promise.all([bankHolidays(), getPaySettings(), listOverrides().catch(() => new Map())]);
  return { bh, rule: settings.holidayRule, overrides };
}

// Actual pay date for a scheduled payday.
export function actualPayday(scheduled, ctx) {
  if (ctx.overrides.has(scheduled)) return ctx.overrides.get(scheduled);
  let k = scheduled;
  const step = ctx.rule === 'before' ? -1 : 1;
  let guard = 0;
  while (!isWorkingDay(k, ctx.bh) && guard++ < 10) k = addDays(k, step);
  return k;
}

// Paydays (scheduled and actual) starting from the cycle that contains `from`.
export function paydays(ctx, from = todayKey(), count = 6) {
  let s = scheduledOnOrAfter(addDays(from, -CYCLE_DAYS + 1));
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({ scheduled: s, actual: actualPayday(s, ctx) });
    s = addDays(s, CYCLE_DAYS);
  }
  return out;
}

// Pay period containing `day`: from one actual payday up to (not including) the next.
export function payPeriod(ctx, day = todayKey()) {
  let s = scheduledOnOrAfter(addDays(day, -CYCLE_DAYS * 2));
  for (let i = 0; i < 6; i++) {
    const start = actualPayday(s, ctx);
    const end = actualPayday(addDays(s, CYCLE_DAYS), ctx);
    if (start <= day && day < end) return { start, end, scheduled: s };
    s = addDays(s, CYCLE_DAYS);
  }
  return null;
}

// Is `day` an actual payday?
export function isPayday(ctx, day) {
  return paydays(ctx, addDays(day, -3), 2).some((p) => p.actual === day);
}
