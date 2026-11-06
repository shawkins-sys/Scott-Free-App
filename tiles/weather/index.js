// Weather tile. Built in Phase 3.
export default {
  id: 'weather',
  title: 'Weather',
  defaultSize: { phone: { w: 4, h: 3 }, desktop: { w: 12, h: 3 } },
  async render(container) {
    container.innerHTML = '<div class="placeholder">Weather arrives in Phase 3.</div>';
  },
  async renderExpanded(container) {
    container.innerHTML = '<p class="muted">Weather arrives in Phase 3.</p>';
  },
};
