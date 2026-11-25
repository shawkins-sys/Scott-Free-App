// Calm Home "Up next": key dates falling today or tomorrow and countdowns within 7 days, in one glass card.
// Hidden when nothing is due. Overdue items and longer reminder windows stay in Plan.
import { listKeyDates, nextDate, daysBetween, displayTitle, ageOn, whenText } from './keydates.js';
import { todayKey } from './date.js';
import { esc } from './wellbeing.js';
import { listCountdowns, cachedCountdowns, daysTo, SOON_DAYS } from './countdowns.js';

const MAX_ROWS = 4;

export async function renderUpNext(slot) {
  if (!slot) return;
  let items = [];
  try { items = await listKeyDates(); } catch (err) { console.warn('Up next not loaded', err); slot.hidden = true; slot.closest('.calm')?.classList.add('no-upnext'); return; }
  if (!slot.isConnected) return;
  const today = todayKey();
  const due = items
    .map((item) => { const date = nextDate(item, today); return { item, date, days: daysBetween(today, date) }; })
    .filter((x) => x.days === 0 || x.days === 1);
  // Countdowns join from 7 days before (Scott, 25/11/2026).
  const cds = await listCountdowns().catch(() => cachedCountdowns());
  if (!slot.isConnected) return;
  cds.map((c) => ({ item: { title: c.title, kind: 'countdown' }, date: c.date, days: daysTo(c, today) }))
    .filter((x) => x.days >= 0 && x.days <= SOON_DAYS)
    .forEach((x) => due.push(x));
  due.sort((a, b) => a.days - b.days);
  // Cards grow to fill the gap when there is no Up next card (see .no-upnext in theme.css).
  slot.closest('.calm')?.classList.toggle('no-upnext', !due.length);
  if (!due.length) { slot.hidden = true; slot.innerHTML = ''; return; }
  const shown = due.slice(0, MAX_ROWS);
  const more = due.length - shown.length;
  slot.innerHTML = `
    <a class="calm-upnext" href="#/hub/plan" aria-label="Up next, open Tools">
      <span class="calm-upnext-head">Up next</span>
      ${shown.map(({ item, date, days }) => {
        const age = item.kind === 'countdown' ? null : ageOn(item, date);
        return `<span class="calm-upnext-row">
          <span class="calm-upnext-title">${esc(item.kind === 'countdown' ? item.title : displayTitle(item))}${age ? ` (${age})` : ''}</span>
          <span class="calm-upnext-when${days === 0 ? ' today' : ''}">${whenText(days)}</span>
        </span>`;
      }).join('')}
      ${more > 0 ? `<span class="calm-upnext-more">+${more} more</span>` : ''}
    </a>`;
  slot.hidden = false;
}
