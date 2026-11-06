// Photos tile. Built in Phase 3.
export default {
  id: 'photos',
  title: 'Photos',
  defaultSize: { phone: { w: 4, h: 5 }, desktop: { w: 6, h: 5 } },
  async render(container) {
    container.innerHTML = '<div class="placeholder">Photos arrives in Phase 3.</div>';
  },
  async renderExpanded(container) {
    container.innerHTML = '<p class="muted">Photos arrives in Phase 3.</p>';
  },
};
