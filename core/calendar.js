// Calendar data for the Calendar tile and Plan hub. Events come from the
// calendar-feed Edge Function (feed URLs stay server-side). Results are
// kept for 15 minutes and the last copy is shown when offline.
import { supabase } from './supabase.js';
import { CONFIG } from '../config.js';
import { todayKey } from './date.js';
import { esc } from './wellbeing.js';
import { openOverlay } from './overlay.js';

const CACHE_KEY = 'sf-calendar';
const CACHE_MINUTES = 15;
let pending = null;

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { return null; }
}

// Returns { configured, events, stale } for today plus the next `days - 1` days.
export async function getEvents(days = 8) {
  const from = todayKey();
  const cached = readCache();
  const fresh = cached && cached.from === from && cached.days >= days
    && Date.now() - cached.at < CACHE_MINUTES * 60 * 1000;
  if (fresh) return cached;
  if (pending) return pending;
  pending = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke('calendar-feed', { body: { from, days: Math.max(days, 8) } });
      if (error) throw error;
      const result = { at: Date.now(), from, days: Math.max(days, 8), configured: data.configured !== false, events: data.events || [] };
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(result)); } catch { /* storage full */ }
      return result;
    } catch (err) {
      if (cached && cached.from === from) return { ...cached, stale: true };
      throw err;
    }
  })();
  try { return await pending; } finally { pending = null; }
}

// ---------- Day helpers (London) ----------

const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: CONFIG.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dayFmt = new Intl.DateTimeFormat('en-GB', { timeZone: CONFIG.timezone, weekday: 'long', day: 'numeric', month: 'long' });

export function addDaysKey(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// Friendly label for a YYYY-MM-DD key: Today, Tomorrow, or "Monday 9 November".
export function dayLabel(key) {
  const today = todayKey();
  if (key === today) return 'Today';
  if (key === addDaysKey(today, 1)) return 'Tomorrow';
  const [y, m, d] = key.split('-').map(Number);
  return dayFmt.format(new Date(Date.UTC(y, m - 1, d, 12))).replace(',', '');
}

// Does the event fall on the London day `key`?
export function onDay(ev, key) {
  if (ev.allDay) return ev.start <= key && ev.end > key;
  const dayStart = todayKey(new Date(ev.start));
  const dayEnd = todayKey(new Date(new Date(ev.end).getTime() - 1));
  return dayStart <= key && dayEnd >= key;
}

export function timeLabel(ev, key) {
  if (ev.allDay) return 'All day';
  const startKey = todayKey(new Date(ev.start));
  const s = startKey === key ? timeFmt.format(new Date(ev.start)) : 'Earlier';
  return `${s} - ${timeFmt.format(new Date(ev.end))}`;
}

export const isFinished = (ev) => (ev.allDay ? ev.end <= todayKey() : new Date(ev.end).getTime() <= Date.now());

// Link that opens Google Calendar on the event's day.
export function googleDayLink(key) {
  const [y, m, d] = key.split('-').map(Number);
  return `https://calendar.google.com/calendar/r/day/${y}/${m}/${d}`;
}

// ---------- Rendering ----------

// Renders the events for one London day as list items.
export function eventRows(events, key, { dimFinished = false } = {}) {
  return events.filter((e) => onDay(e, key)).map((e) => `
    <li class="ev${dimFinished && key === todayKey() && isFinished(e) ? ' done' : ''}">
      <button type="button" class="ev-btn" data-ev="${esc(e.id)}" data-day="${key}">
        <span class="ev-time">${timeLabel(e, key)}</span>
        <span class="ev-title">${esc(e.title)}</span>
        ${e.location ? `<span class="ev-loc">${esc(e.location)}</span>` : ''}
      </button>
    </li>`).join('');
}

// Plain text description: strips tags Google sometimes includes, keeps line breaks.
function descriptionHtml(text) {
  const plain = String(text).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
  return esc(plain).replace(/\n/g, '<br>');
}

export function openEventDetail(ev, key) {
  openOverlay(ev.title, (body) => {
    body.innerHTML = `
      <div class="ev-detail">
        <p><strong>${dayLabel(key)}</strong><br>${timeLabel(ev, key)}</p>
        ${ev.location ? `<p>${esc(ev.location)}</p>` : ''}
        ${ev.description ? `<p class="muted">${descriptionHtml(ev.description)}</p>` : ''}
        <a class="pill-btn" href="${googleDayLink(key)}" target="_blank" rel="noopener">Open in Google Calendar</a>
      </div>`;
  });
}

// Wires up taps on event rows inside `container`.
export function bindEventClicks(container, events) {
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ev]');
    if (!btn) return;
    const ev = events.find((x) => x.id === btn.dataset.ev);
    if (ev) openEventDetail(ev, btn.dataset.day);
  });
}

// Agenda for today plus the next 7 days, used by the Plan hub and the expanded tile.
export async function renderAgenda(container, days = 8) {
  container.innerHTML = '<p class="muted">Loading calendar...</p>';
  let data;
  try { data = await getEvents(days); } catch (err) {
    console.warn('Calendar failed', err);
    container.innerHTML = '<p class="muted">The calendar is not available right now.</p>';
    return;
  }
  if (!data.configured) { container.innerHTML = '<p class="muted">Calendar is not connected yet.</p>'; return; }
  const today = todayKey();
  const sections = [];
  for (let i = 0; i < days; i++) {
    const key = addDaysKey(today, i);
    const rows = eventRows(data.events, key, { dimFinished: true });
    sections.push(`
      <section class="agenda-day">
        <h3 class="agenda-head">${dayLabel(key)}</h3>
        ${rows ? `<ul class="ev-list">${rows}</ul>` : '<p class="muted small agenda-empty">Nothing planned</p>'}
      </section>`);
  }
  container.innerHTML = `${data.stale ? '<p class="muted small">Showing the last saved calendar.</p>' : ''}${sections.join('')}`;
  bindEventClicks(container, data.events);
}
