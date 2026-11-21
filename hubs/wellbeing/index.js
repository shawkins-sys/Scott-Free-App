// Wellbeing hub: history calendar (tap today to view or edit today's check-in).
// Each day is coloured by that morning's mood; tap a day to see its check-in.
// Phrase management moved to Settings (15/11/2026).
// Phase 8: Trends card and a Box breathing button. Weekly review follows.
import { METRICS, getTodayCheckin, listCheckins, esc, levelOf } from '../../core/wellbeing.js';
import { renderCheckinForm, sleepOutOfRange } from '../../core/checkin.js';
import { openOverlay } from '../../core/overlay.js';
import { todayKey } from '../../core/date.js';
import { dayLabel } from '../../core/calendar.js';
import { formatKey } from '../../core/keydates.js';
import { renderTrends } from './trends.js';
import { isWall } from '../../core/device.js';
import { runBreathing } from '../../core/breathing.js';
import { listReviews, buildSnapshot, reviewHtml, weekStartOf, syncReviews } from '../../core/weekly.js';

// Weekly review card: this week so far (not saved) and Past reviews, newest first.
async function renderWeekly(card) {
  card.innerHTML = '<h2 class="card-title">Weekly review</h2><p class="muted small">Loading...</p>';
  let reviews = [];
  try { await syncReviews(); reviews = await listReviews(); } catch (err) { console.warn(err); }
  card.innerHTML = `
    <h2 class="card-title">Weekly review</h2>
    <button class="pill-btn" data-week-now>This week so far</button>
    <h3 class="w-head">Past reviews</h3>
    ${reviews.length ? `<ul class="row-list">${reviews.map((r) => `
      <li><button class="row-btn" data-week="${r.week_start}"><span>Week of ${formatKey(r.week_start)}${r.reflection ? '<span class="muted small block">Reflection added</span>' : ''}</span>
        <span class="muted small">${r.reviewed ? 'Reviewed' : ''}</span></button></li>`).join('')}</ul>` : '<p class="muted small">Your first review is saved this Sunday.</p>'}`;
  card.onclick = async (e) => {
    if (e.target.closest('[data-week-now]')) {
      const ws = weekStartOf(todayKey());
      openOverlay('This week so far', async (body) => {
        body.innerHTML = '<p class="muted">Working it out...</p>';
        try { body.innerHTML = reviewHtml({ week_start: ws, snapshot: await buildSnapshot(ws) }, { showMoney: !isWall() }); }
        catch { body.innerHTML = '<p class="muted">Not available right now.</p>'; }
      });
      return;
    }
    const b = e.target.closest('[data-week]');
    if (!b) return;
    const r = reviews.find((x) => x.week_start === b.dataset.week);
    openOverlay(`Week of ${formatKey(r.week_start)}`, (body) => { body.innerHTML = reviewHtml(r, { showMoney: !isWall() }); });
  };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n) => String(n).padStart(2, '0');

// Read-only summary of one check-in.
function summaryHtml(entry) {
  const m = entry.metrics || {};
  const rows = METRICS.map((x) => `
    <li><span>${x.label}</span><span class="dot dot-${levelOf(x.key, m[x.key])} mini" aria-label="${m[x.key]} of 5"><span>${m[x.key] ?? '-'}</span></span></li>`).join('');
  const hours = entry.hours_slept != null ? `${Number(entry.hours_slept)} h` : '-';
  return `
    <ul class="summary">${rows}
      <li><span>Hours slept</span><span${entry.hours_slept != null && sleepOutOfRange(Number(entry.hours_slept)) ? ' class="sleep-warn"' : ''}>${hours}</span></li>
      <li><span>Exercise yesterday</span><span>${entry.exercised ? 'Yes' : 'No'}</span></li>
    </ul>
    ${entry.note ? `<p class="note">${esc(entry.note)}</p>` : ''}`;
}

const state = { month: null }; // 'YYYY-MM', remembered while the app is open

async function renderHistory(card, onToday) {
  const today = todayKey();
  if (!state.month) state.month = today.slice(0, 7);
  const [y, m] = state.month.split('-').map(Number);
  const first = `${y}-${pad(m)}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // Monday first

  card.innerHTML = `<h2 class="card-title">History</h2><p class="muted small">Loading...</p>`;
  let entries;
  try { entries = await listCheckins(first, next); } catch (err) {
    console.error(err);
    card.innerHTML = '<h2 class="card-title">History</h2><p class="muted small">History is not available right now.</p>';
    return;
  }
  const byDay = new Map(entries.map((e) => [e.day, e]));

  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<span class="cal-cell empty"></span>');
  for (let d = 1; d <= daysIn; d++) {
    const key = `${y}-${pad(m)}-${pad(d)}`;
    const e = byDay.get(key);
    const mood = e && e.metrics && e.metrics.mood;
    const cls = ['cal-cell', key === today ? 'today' : '', key > today ? 'future' : '', mood ? `dot-${mood} has` : ''].join(' ');
    cells.push(e
      ? `<button class="${cls}" data-day="${key}" aria-label="${dayLabel(key)}, mood ${mood} of 5">${d}</button>`
      : `<span class="${cls}">${d}</span>`);
  }
  const isCurrent = state.month === today.slice(0, 7);

  card.innerHTML = `
    <h2 class="card-title">History</h2>
    <div class="period-nav">
      <button class="icon-btn" data-step="-1" aria-label="Previous month">&lsaquo;</button>
      <span>${MONTHS[m - 1]} ${y}</span>
      <button class="icon-btn" data-step="1" aria-label="Next month"${isCurrent ? ' disabled' : ''}>&rsaquo;</button>
    </div>
    <div class="cal-grid cal-dow">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x) => `<span>${x}</span>`).join('')}</div>
    <div class="cal-grid">${cells.join('')}</div>
    <p class="muted small cal-legend">Colour shows mood: <span class="dot dot-1 mini-dot"></span>1 (low) to <span class="dot dot-5 mini-dot"></span>5 (great).
      ${entries.length} check-in${entries.length === 1 ? '' : 's'} this month. Tap a day to see it.</p>`;

  card.onclick = (ev) => {
    const step = ev.target.closest('[data-step]');
    if (step && !step.disabled) {
      const t = y * 12 + (m - 1) + Number(step.dataset.step);
      state.month = `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
      renderHistory(card, onToday);
      return;
    }
    const day = ev.target.closest('[data-day]');
    if (!day) return;
    const e = byDay.get(day.dataset.day);
    if (day.dataset.day === today) { onToday(); return; }
    openOverlay(`${dayLabel(e.day)} (${formatKey(e.day)})`, (body) => { body.innerHTML = summaryHtml(e); });
  };
}

export default {
  id: 'wellbeing',
  title: 'Wellbeing',
  async render(container) {
    container.innerHTML = `
      <div class="card" id="wb-history"></div>
      <div class="card" id="wb-trends"></div>
      <div class="card" id="wb-weekly"></div>
      <div class="card"><h2 class="card-title">Box breathing</h2>
        <p class="muted small">Breathe in 4, hold 4, out 4, hold 4. Four rounds, about a minute.</p>
        <button class="pill-btn" data-breathe>Start</button></div>`;
    container.querySelector('[data-breathe]').addEventListener('click', () => runBreathing());
    const historyEl = container.querySelector('#wb-history');

    const editToday = async () => {
      const entry = await getTodayCheckin({ refresh: true });
      if (!entry) return;
      const close = openOverlay("Edit today's check-in", (body) => renderCheckinForm(body, {
        existing: entry,
        submitLabel: 'Save changes',
        onSaved: async () => { close(); await renderHistory(historyEl, editToday); },
      }));
    };

    // The Today card was removed (Scott, 21/11/2026): tap today in the History
    // calendar to view and edit today's check-in.
    await Promise.all([renderHistory(historyEl, editToday), renderTrends(container.querySelector('#wb-trends')), renderWeekly(container.querySelector('#wb-weekly'))]);
  },
};
