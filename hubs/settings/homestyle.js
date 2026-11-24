// Settings, Home style (phone only): Calm or Tiles. The wall display and
// computers always use the tile grid, so this section is hidden there.
import { HOME_STYLES, homeStyle, setHomeStyle } from '../../core/calm.js';

export function renderHomeStyleSettings(body) {
  const draw = () => {
    const cur = homeStyle();
    body.innerHTML = `
      <p class="muted small">Calm shows a quiet Home with your photo and a swipe row of cards. Tiles keeps the movable tile layout. This applies to the phone only.</p>
      <div class="chips home-style">${HOME_STYLES.map(([id, label]) => `<button type="button" class="chip${cur === id ? ' active' : ''}" data-style="${id}" aria-pressed="${cur === id}">${label}</button>`).join('')}</div>
      <p class="form-msg" aria-live="polite"></p>`;
  };
  draw();
  body.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-style]');
    if (!b) return;
    const msg = body.querySelector('.form-msg');
    try {
      await setHomeStyle(b.dataset.style);
      draw();
      body.querySelector('.form-msg').textContent = 'Saved. Home will use this next time you open it.';
    } catch (err) {
      console.error(err);
      msg.textContent = 'Could not save. Try again.';
      msg.classList.add('error');
    }
  });
}
