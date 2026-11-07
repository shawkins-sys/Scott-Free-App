// Calendar tile: today's events (read-only, edited in Google Calendar).
// Finished events are dimmed. Expand for today plus the next 7 days.
import { getEvents, eventRows, bindEventClicks, renderAgenda } from '../../core/calendar.js';
import { todayKey } from '../../core/date.js';

export default {
  id: 'calendar',
  title: 'Calendar',
  defaultSize: { phone: { w: 4, h: 4 }, desktop: { w: 6, h: 5 } },
  async render(container) {
    container.innerHTML = '<p class="muted">Loading calendar...</p>';
    let data;
    try { data = await getEvents(8); } catch (err) {
      console.warn('Calendar failed', err);
      container.innerHTML = '<p class="muted">The calendar is not available right now.</p>';
      return;
    }
    if (!data.configured) { container.innerHTML = '<p class="muted">Calendar is not connected yet.</p>'; return; }
    const rows = eventRows(data.events, todayKey(), { dimFinished: true });
    container.innerHTML = `
      ${rows ? `<ul class="ev-list">${rows}</ul>` : '<p class="muted">Nothing in the calendar today.</p>'}
      ${data.stale ? '<p class="muted small">Showing the last saved calendar.</p>' : ''}`;
    bindEventClicks(container, data.events);
  },
  renderExpanded(container) {
    return renderAgenda(container, 8);
  },
};
