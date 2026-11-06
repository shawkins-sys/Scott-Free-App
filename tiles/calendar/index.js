// Calendar tile. Built in Phase 4.
export default {
  id: 'calendar',
  title: 'Calendar',
  defaultSize: { phone: { w: 4, h: 4 }, desktop: { w: 6, h: 5 } },
  async render(container) {
    container.innerHTML = '<div class="placeholder">Calendar arrives in Phase 4.</div>';
  },
  async renderExpanded(container) {
    container.innerHTML = '<p class="muted">Calendar arrives in Phase 4.</p>';
  },
};
