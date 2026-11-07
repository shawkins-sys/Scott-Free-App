// Calendar tile: today's events (read-only, edited in Google Calendar),
// with today's key dates shown first. Finished events are dimmed.
// Expand for today plus the next 7 days.
import { getEvents, eventRows, bindEventClicks, renderAgenda, getKeyDatesSafe } from '../../core/calendar.js';
import { keyDateRows } from '../../core/keydates.js';
import { todayKey } from '../../core/date.js';

export default {
  id: 'calendar',
  title: 'Calendar',
  defaultSize: { phone: { w: 4, h: 4 }, desktop: { w: 6, h: 5 } },
  async render(container) {
    container.innerHTML = '<p class="muted">Loading calendar...</p>';
    const [result, keyDates] = await Promise.all([
      getEvents(8).catch((err) => { console.warn('Calendar failed', err); return null; }),
      getKeyDatesSafe(),
    ]);
    const today = todayKey();
    const events = result && result.configured ? result.events : [];
    const rows = keyDateRows(keyDates, today) + eventRows(events, today, { dimFinished: true });
    const note = !result ? 'The calendar is not available right now.'
      : !result.configured ? 'Calendar is not connected yet.'
      : result.stale ? 'Showing the last saved calendar.' : '';
    container.innerHTML = `
      ${rows ? `<ul class="ev-list">${rows}</ul>` : (result && result.configured ? '<p class="muted">Nothing in the calendar today.</p>' : '')}
      ${note ? `<p class="muted small">${note}</p>` : ''}`;
    bindEventClicks(container, events);
  },
  renderExpanded(container) {
    return renderAgenda(container, 8);
  },
};
