// Tools page (calm style, phone only; Scott, 25/11/2026). Replaces the Plan list
// on the phone: a "Coming up" card (calendar events and key dates in the next
// 7 days, hidden when there are none) and a grid of glass tool tiles. Each tile
// shows a live status line and opens its tool in a glass sheet. The wall display
// and the Tiles style keep the original Plan layout (see index.js).
import { getEvents, getKeyDatesSafe, addDaysKey, dayLabel, eventRows, bindEventClicks } from '../../core/calendar.js';
import { nextDate, daysBetween, displayTitle, keyDateRows, formatKey } from '../../core/keydates.js';
import { listTimers, isRunning, remainingMs, formatMs } from '../../core/timers.js';
import * as shop from '../../core/shopping.js';
import { todayKey } from '../../core/date.js';
import { esc } from '../../core/wellbeing.js';
import { openOverlay } from '../../core/overlay.js';
import { renderShopping } from './shopping.js';
import { renderTimers } from './timers.js';
import { renderRenewalCopy } from './renewals.js';
import { renderCountdowns } from './countdowns.js';
import { renderNotes } from './notes.js';
import { renderLastDone } from './lastdone.js';
import { renderCalc, lastAnswer } from './calc.js';
import { cachedLastDone, listLastDone, lastDoneStatus, dueNow, info, dueText } from '../../core/lastdone.js';
import { cachedNotes, listNotes, notesStatus } from '../../core/notes.js';
import { cachedCountdowns, listCountdowns, countdownStatus, countdownRows } from '../../core/countdowns.js';

const DAYS = 8; // today plus the next 7 days

const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  lists: svg('<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>'),
  timers: svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/>'),
  countdowns: svg('<path d="M7 3h10M7 21h10M8 3v3.5a4 4 0 0 0 1.6 3.2L12 12l2.4-2.3A4 4 0 0 0 16 6.5V3M8 21v-3.5a4 4 0 0 1 1.6-3.2L12 12l2.4 2.3a4 4 0 0 1 1.6 3.2V21"/>'),
  notes: svg('<path d="M6 3.5h9l4 4V20a.5.5 0 0 1-.5.5h-12A.5.5 0 0 1 6 20z"/><path d="M15 3.5V8h4M9 12h7M9 15.5h7"/>'),
  lastdone: svg('<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3 4v4h4"/><path d="M12 7.5V12l3 2"/>'),
  calc: svg('<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8 7.5h8"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 15.5h.01M12 15.5h.01M15.5 15.5h.01M8.5 18h.01M12 18h.01M15.5 18h.01" stroke-width="2.4"/>'),
  keydates: svg('<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M12 13.5v3M10.5 15h3"/>'),
};

const TOOLS = [
  { id: 'lists', title: 'Lists' },
  { id: 'timers', title: 'Timers' },
  { id: 'keydates', title: 'Key dates' },
  { id: 'countdowns', title: 'Countdowns' },
  { id: 'lastdone', title: 'Last done' },
  { id: 'notes', title: 'Quick notes' },
  { id: 'calc', title: 'Calculator' },
];

const tileHtml = (t) => `
  <button type="button" class="tool-tile" data-tool="${t.id}">
    <span class="tool-icon">${ICON[t.id]}</span>
    <span class="tool-name">${t.title}</span>
    <span class="tool-status" data-status="${t.id}">&nbsp;</span>
  </button>`;

// ---------- Status lines ----------
function listsStatus() {
  const s = shop.getState();
  const open = s.items.filter((i) => !i.done);
  if (!s.lists.length) return 'No lists yet';
  if (!open.length) return 'All ticked off';
  const lists = shop.listsSorted().filter((l) => open.some((i) => i.list_id === l.id));
  if (lists.length === 1) return `${lists[0].name}, ${open.length} item${open.length === 1 ? '' : 's'}`;
  return `${open.length} items in ${lists.length} lists`;
}

function timersStatus() {
  const all = listTimers();
  const running = all.filter(isRunning);
  if (running.length) {
    const t = running.sort((a, b) => remainingMs(a) - remainingMs(b))[0];
    return `${t.name} ${formatMs(remainingMs(t))}${running.length > 1 ? ` +${running.length - 1}` : ''}`;
  }
  const finished = all.filter((t) => t.finishedAt).length;
  if (finished) return `${finished} finished`;
  const paused = all.length;
  return paused ? `${paused} paused` : 'None running';
}

function keyDatesStatus(items) {
  if (!items) return '&nbsp;';
  if (!items.length) return 'None saved';
  const today = todayKey();
  const next = items
    .map((i) => ({ i, d: nextDate(i, today) }))
    .sort((a, b) => a.d.localeCompare(b.d))[0];
  const days = daysBetween(today, next.d);
  const when = days < 0 ? 'overdue' : formatKey(next.d).slice(0, 5);
  return `Next: ${esc(displayTitle(next.i))} ${when}`;
}

// ---------- Coming up ----------
async function renderComingUp(slot, keyDates, countdowns, lastDone, onKeyDate, onCountdown, onLastDone) {
  const result = await getEvents(DAYS).catch((err) => { console.warn('Calendar failed', err); return null; });
  if (!slot.isConnected) return;
  const events = result && result.configured ? result.events : [];
  const today = todayKey();
  const days = [];
  for (let i = 0; i < DAYS; i += 1) {
    const key = addDaysKey(today, i);
    const rows = countdownRows(countdowns, key) + keyDateRows(keyDates, key, today) + eventRows(events, key, { dimFinished: true });
    if (rows) days.push(`<section class="agenda-day"><h3 class="agenda-head">${dayLabel(key)}</h3><ul class="ev-list">${rows}</ul></section>`);
  }
  // Last done items due today or overdue sit at the top (Scott, 25/11/2026).
  const due = dueNow(lastDone);
  if (due.length) {
    days.unshift(`<section class="agenda-day"><h3 class="agenda-head">Due now</h3><ul class="ev-list">${due.map((x) => `
      <li class="ev kd ldr${info(x).state === 'overdue' ? ' overdue' : ''}"><a class="ev-btn" href="#/hub/plan">
        <span class="ev-time">Last done</span><span class="ev-title">${esc(x.title)}</span><span class="ev-loc">${dueText(info(x))}</span>
      </a></li>`).join('')}</ul></section>`);
  }
  if (!days.length) { slot.hidden = true; slot.innerHTML = ''; return; }
  slot.innerHTML = `<div class="card tools-coming"><h2 class="card-title">Coming up</h2>${days.join('')}</div>`;
  slot.hidden = false;
  bindEventClicks(slot, events);
  // Key date rows link to this page; open the Key dates sheet instead.
  slot.querySelectorAll('.kd a').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    if (a.closest('.cdr')) onCountdown(); else if (a.closest('.ldr')) onLastDone(); else onKeyDate();
  }));
}

// ---------- Sheets ----------
// Each tool renders into a plain card inside the glass sheet; the card's own
// heading is hidden there because the sheet already shows the title.
function openSheet(title, fn, onClose) {
  openOverlay(title, async (body) => {
    body.innerHTML = '<div class="calm-page tools-sheet"><div class="card"></div></div>';
    await fn(body.querySelector('.card'), body.querySelector('.tools-sheet'));
  }, { glass: true, onClose });
}

export async function renderTools(container, { renderKeyDates }) {
  container.innerHTML = `
    <div id="tools-coming" hidden></div>
    <div class="tools-grid">${TOOLS.map(tileHtml).join('')}</div>`;

  let keyDates = null;
  let countdowns = cachedCountdowns();
  let notes = cachedNotes();
  let lastDone = cachedLastDone();
  const setStatus = (id, html) => {
    const el = container.querySelector(`[data-status="${id}"]`);
    if (el) el.innerHTML = html;
  };
  const refreshStatus = () => {
    if (!container.isConnected) return;
    setStatus('lists', esc(listsStatus()));
    setStatus('timers', esc(timersStatus()));
    setStatus('keydates', keyDatesStatus(keyDates));
    setStatus('countdowns', esc(countdownStatus(countdowns)));
    setStatus('notes', esc(notesStatus(notes)));
    setStatus('calc', esc(lastAnswer() ? `Last answer: ${lastAnswer()}` : 'Tap to work something out'));
    setStatus('lastdone', esc(lastDoneStatus(lastDone)));
    const ld = container.querySelector('[data-tool="lastdone"]');
    if (ld) ld.dataset.state = lastDone.length ? info(lastDone[0]).state : 'none';
  };
  const loadKeyDates = async () => {
    keyDates = await getKeyDatesSafe();
    refreshStatus();
    return keyDates;
  };

  const openKeyDates = () => openSheet('Key dates', async (card, wrap) => {
    // One-off renewals card sits above the key dates until done or dismissed.
    const ren = document.createElement('div');
    ren.className = 'card tools-renewals';
    wrap.prepend(ren);
    await Promise.all([
      renderKeyDates(card),
      renderRenewalCopy(ren, { onDone: () => renderKeyDates(card) }),
    ]);
  }, refreshAll);

  const openLastDone = () => openSheet('Last done', (card) => renderLastDone(card), refreshAll);
  const openCountdowns = () => openSheet('Countdowns', (card) => renderCountdowns(card), refreshAll);

  async function refreshAll() {
    if (!container.isConnected) return;
    const [items, cds] = await Promise.all([
      loadKeyDates(),
      listCountdowns().catch((err) => { console.warn('Countdowns not loaded', err); return countdowns; }),
    ]);
    countdowns = cds;
    notes = await listNotes().catch(() => notes);
    lastDone = await listLastDone().catch(() => lastDone);
    refreshStatus();
    renderComingUp(container.querySelector('#tools-coming'), items, countdowns, lastDone, openKeyDates, openCountdowns, openLastDone);
  }

  container.querySelector('.tools-grid').addEventListener('click', (e) => {
    const tile = e.target.closest('[data-tool]');
    if (!tile) return;
    const id = tile.dataset.tool;
    if (id === 'lists') openSheet('Lists', (card) => renderShopping(card), refreshStatus);
    if (id === 'timers') openSheet('Timers', (card) => renderTimers(card), refreshStatus);
    if (id === 'keydates') openKeyDates();
    if (id === 'countdowns') openCountdowns();
    if (id === 'lastdone') openLastDone();
    if (id === 'calc') openSheet('Calculator', (card) => renderCalc(card), refreshStatus);
    if (id === 'notes') openSheet('Quick notes', (card) => renderNotes(card), () => { notes = cachedNotes(); refreshStatus(); });
  });

  // Live updates: list changes, timer ticks. Listeners stop once the page is left.
  const offShop = shop.onChange(() => (container.isConnected ? refreshStatus() : offShop()));
  const onTimer = () => (container.isConnected ? refreshStatus() : (window.removeEventListener('sf:timers', onTimer), window.removeEventListener('sf:timers-tick', onTimer)));
  window.addEventListener('sf:timers', onTimer);
  window.addEventListener('sf:timers-tick', onTimer);

  refreshStatus();
  await refreshAll();
}
