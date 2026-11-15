// Weekly review (Monday to Sunday). A snapshot of the week's figures is saved
// in weekly_reviews: on Sunday it refreshes while the card is shown; weeks
// with no snapshot (app not opened that Sunday) are filled in later, up to
// eight weeks back. Money parts are optional so the wall display (brief 14.4)
// can hide them.
import { supabase, currentUserId } from './supabase.js';
import { todayKey } from './date.js';
import { METRICS, listCheckins, esc } from './wellbeing.js';
import { listKeyDates, nextDate, daysBetween, displayTitle, whenText, formatKey } from './keydates.js';
import { listPayments, renewalsSoon, alertText, money } from './money.js';

const BACKFILL_WEEKS = 8;
const KEYS = [...METRICS.map((m) => ({ key: m.key, label: m.label })), { key: 'hours', label: 'Hours slept' }];

const parse = (k) => k.split('-').map(Number);
export const addDays = (k, n) => { const [y, m, d] = parse(k); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const weekdayMon0 = (k) => { const [y, m, d] = parse(k); return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; };
export const weekStartOf = (k) => addDays(k, -weekdayMon0(k));
export const isSunday = (k = todayKey()) => weekdayMon0(k) === 6;

function averages(entries) {
  const out = { count: entries.length };
  for (const { key } of KEYS) {
    const vals = entries.map((e) => (key === 'hours' ? (e.hours_slept == null ? null : Number(e.hours_slept)) : (e.metrics || {})[key]))
      .filter((v) => v != null);
    out[key] = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
  }
  return out;
}

// Works out the figures for the week starting `ws` (a Monday).
export async function buildSnapshot(ws) {
  const sunday = addDays(ws, 6);
  const today = todayKey();
  const [thisWeek, lastWeek] = await Promise.all([
    listCheckins(ws, addDays(ws, 7)),
    listCheckins(addDays(ws, -7), ws),
  ]);
  const snap = { builtAt: new Date().toISOString(), weekStart: ws, checkins: { this: averages(thisWeek), last: averages(lastWeek) } };

  // Money: spending so far this pay period (up to the Sunday) and expenses owed.
  try {
    const [{ listTransactions, summarise, expensesTotals }, { payContext, payPeriod }, { listCategories }] = await Promise.all([
      import('./statement.js'), import('./payschedule.js'), import('./money.js')]);
    const ctx = await payContext();
    const period = payPeriod(ctx, sunday);
    const to = period.end < addDays(sunday, 1) ? period.end : addDays(sunday, 1);
    const [txs, cats, owed] = await Promise.all([listTransactions({ from: period.start, to }), listCategories(), expensesTotals()]);
    const s = summarise(txs, cats);
    snap.money = { periodStart: period.start, periodEnd: addDays(period.end, -1), spending: s.spending, saved: s.saved, owed: owed.outstanding };
  } catch (err) { console.warn('Weekly money figures not available', err); }

  // Key dates and renewals in the fortnight after the Sunday.
  try {
    const [items, pays] = await Promise.all([listKeyDates(), listPayments()]);
    const kd = items.map((i) => ({ i, date: nextDate(i, addDays(sunday, 1)) }))
      .map((x) => ({ ...x, days: daysBetween(sunday, x.date) }))
      .filter((x) => x.days >= 1 && x.days <= 14)
      .sort((a, b) => a.days - b.days)
      .map((x) => `${displayTitle(x.i)}, ${formatKey(x.date)}`);
    const ren = renewalsSoon(pays, addDays(sunday, 1), 14).map(alertText);
    snap.upcoming = [...kd, ...ren].slice(0, 8);
  } catch (err) { console.warn('Weekly key dates not available', err); }

  // Next week's calendar: only known when built on the Sunday itself.
  if (sunday === today) {
    try {
      const { getEvents, onDay, dayLabel } = await import('./calendar.js');
      const data = await getEvents(8);
      if (data.configured) {
        snap.nextWeek = [];
        for (let i = 1; i <= 7; i++) {
          const k = addDays(sunday, i);
          const evs = data.events.filter((e) => onDay(e, k)).map((e) => e.title);
          snap.nextWeek.push({ day: k, label: dayLabel(k), titles: evs.slice(0, 3), more: Math.max(0, evs.length - 3) });
        }
      }
    } catch (err) { console.warn('Weekly calendar not available', err); }
  }
  return snap;
}

// ---------- Storage ----------

export async function getReview(ws) {
  const { data, error } = await supabase.from('weekly_reviews').select('*').eq('week_start', ws).maybeSingle();
  if (error) throw error;
  return data;
}
export async function listReviews() {
  const { data, error } = await supabase.from('weekly_reviews').select('*').order('week_start', { ascending: false });
  if (error) throw error;
  return data || [];
}
export async function saveReview(ws, fields) {
  const user_id = await currentUserId();
  const { data, error } = await supabase.from('weekly_reviews')
    .upsert({ user_id, week_start: ws, ...fields }, { onConflict: 'user_id,week_start' }).select().single();
  if (error) throw error;
  return data;
}

// On Sunday: refresh this week's snapshot (keeping reflection and Reviewed).
// Any day: fill in missed past weeks, back to the first check-in, at most 8.
export async function syncReviews() {
  const today = todayKey();
  const thisWs = weekStartOf(today);
  const existing = await listReviews();
  const have = new Set(existing.map((r) => r.week_start));
  const first = await listCheckins('2000-01-01', addDays(today, 1)).then((e) => e[0]?.day).catch(() => null);
  if (first) {
    for (let i = BACKFILL_WEEKS; i >= 1; i--) {
      const ws = addDays(thisWs, -7 * i);
      if (have.has(ws) || addDays(ws, 6) < first) continue;
      await saveReview(ws, { snapshot: await buildSnapshot(ws) });
    }
  }
  if (isSunday(today)) {
    const current = existing.find((r) => r.week_start === thisWs);
    return saveReview(thisWs, { snapshot: await buildSnapshot(thisWs), ...(current ? { reflection: current.reflection, reviewed: current.reviewed } : {}) });
  }
  return null;
}

// ---------- Rendering ----------

function trend(now, before) {
  if (now == null) return '<span class="muted">No check-ins</span>';
  if (before == null) return `<strong>${now}</strong>`;
  const d = Math.round((now - before) * 10) / 10;
  return `<strong>${now}</strong> <span class="muted small">${d === 0 ? 'same as last week' : `${d > 0 ? 'up' : 'down'} from ${before}`}</span>`;
}

// Review body. `showMoney: false` hides all money figures (wall display).
export function reviewHtml(review, { showMoney = true } = {}) {
  const s = review.snapshot || {};
  const c = s.checkins || { this: {}, last: {} };
  const ws = review.week_start || s.weekStart;
  return `
    <p class="muted small">Week ${formatKey(ws)} to ${formatKey(addDays(ws, 6))} &middot; ${c.this.count || 0} check-in${c.this.count === 1 ? '' : 's'}</p>
    <h3 class="w-head">Check-in averages</h3>
    <ul class="summary">${KEYS.map(({ key, label }) => `<li><span>${label}</span><span>${trend(c.this[key], c.last[key])}</span></li>`).join('')}</ul>
    ${showMoney && s.money ? `
      <h3 class="w-head">Money</h3>
      <ul class="summary">
        <li><span>Spending this pay period</span><span><strong>${money(s.money.spending)}</strong> <span class="muted small">since ${formatKey(s.money.periodStart)}</span></span></li>
        ${s.money.saved ? `<li><span>Saved</span><span>${money(s.money.saved)}</span></li>` : ''}
        <li><span>Expenses owed to you</span><span><strong>${money(s.money.owed)}</strong></span></li>
      </ul>` : ''}
    <h3 class="w-head">Coming up</h3>
    ${s.upcoming && s.upcoming.length ? `<ul class="pattern-list">${s.upcoming.filter((u) => showMoney || !/renews|cancel by/.test(u)).map((u) => `<li>${esc(u)}</li>`).join('')}</ul>` : '<p class="muted small">Nothing in the next two weeks.</p>'}
    ${s.nextWeek ? `
      <h3 class="w-head">Next week</h3>
      <ul class="row-list week-glance">${s.nextWeek.map((d) => `
        <li><span class="glance-day">${esc(d.label)}</span><span>${d.titles.length ? esc(d.titles.join(', ')) + (d.more ? ` <span class="muted small">+${d.more} more</span>` : '') : '<span class="muted small">Free</span>'}</span></li>`).join('')}</ul>` : ''}
    ${review.reflection ? `<h3 class="w-head">How the week went</h3><p class="note">${esc(review.reflection)}</p>` : ''}`;
}

// ---------- Home card (Sundays, after the check-in, until Reviewed) ----------

export async function renderWeeklyCard(slot, { showMoney = true } = {}) {
  if (!slot) return;
  try {
    const review = await syncReviews(); // refreshes Sunday's snapshot, fills missed weeks
    if (!review || review.reviewed || !slot.isConnected) { slot.innerHTML = ''; return; }
    slot.innerHTML = `
      <div class="card weekly-card">
        <h2 class="card-title">Weekly review</h2>
        ${reviewHtml({ ...review, reflection: null }, { showMoney })}
        <label class="field"><span>How did this week go? (optional)</span>
          <input name="reflection" maxlength="200" value="${esc(review.reflection || '')}"></label>
        <div class="btn-row"><button class="primary-btn" data-reviewed>Mark as reviewed</button></div>
        <p class="form-msg" aria-live="polite"></p>
      </div>`;
    const input = slot.querySelector('[name=reflection]');
    const msg = slot.querySelector('.form-msg');
    const save = (fields) => saveReview(review.week_start, { snapshot: review.snapshot, ...fields });
    input.addEventListener('change', async () => {
      try { await save({ reflection: input.value.trim() || null, reviewed: false }); msg.classList.remove('error'); msg.textContent = 'Saved.'; }
      catch { msg.classList.add('error'); msg.textContent = 'That did not save. Please try again.'; }
    });
    slot.querySelector('[data-reviewed]').addEventListener('click', async () => {
      try { await save({ reflection: input.value.trim() || null, reviewed: true }); slot.innerHTML = ''; }
      catch { msg.classList.add('error'); msg.textContent = 'That did not save. Please try again.'; }
    });
  } catch (err) {
    console.warn('Weekly review not available', err);
    slot.innerHTML = '';
  }
}
