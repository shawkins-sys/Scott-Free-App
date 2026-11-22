// Settings, Morning: which sections show on the Morning page.
import { SECTIONS, loadShow, saveShow } from '../../core/morning.js';

export async function renderMorningSettings(container) {
  let show = await loadShow();
  container.innerHTML = `
    <p class="muted small">Choose what appears on the Morning page. Headlines with heavy news (deaths, war, crashes and similar) are always left out.</p>
    ${SECTIONS.map(([id, label]) => `<label class="check"><input type="checkbox" data-id="${id}"${show[id] ? ' checked' : ''}> ${label}</label>`).join('')}
    <p class="form-msg" aria-live="polite"></p>`;
  const msg = container.querySelector('.form-msg');
  container.addEventListener('change', async (e) => {
    const box = e.target.closest('[data-id]');
    if (!box) return;
    const before = show;
    show = { ...show, [box.dataset.id]: box.checked };
    msg.classList.remove('error');
    msg.textContent = 'Saving...';
    try { await saveShow(show); msg.textContent = 'Saved.'; }
    catch (err) {
      console.error(err);
      show = before;
      box.checked = !box.checked;
      msg.textContent = 'That did not save. Please try again.';
      msg.classList.add('error');
    }
  });
}
