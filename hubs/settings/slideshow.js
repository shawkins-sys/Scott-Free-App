// Settings, Photos: slideshow speed and transition, set separately for
// phones and computers, and for the wall display. Saved to the account so
// the wall picks up changes made on the phone (within 5 minutes).
import { getSettings, updateSettings } from '../../core/wellbeing.js';
import { isWall } from '../../core/device.js';
import { SPEEDS, EFFECTS, slideshowFrom, applySlideshow } from '../../tiles/photos/index.js';

const KINDS = [['phone', 'Phone and computer'], ['wall', 'Wall display']];

export async function renderSlideshowSettings(container) {
  let cfg;
  try { cfg = slideshowFrom((await getSettings()).slideshow); } catch { cfg = slideshowFrom(null); }
  const here = isWall() ? 'wall' : 'phone';

  const draw = (msg = '', error = false) => {
    container.innerHTML = `
      <h3 class="slide-head">Slideshow</h3>
      ${KINDS.map(([kind, label]) => `
        <div class="slide-kind" data-kind="${kind}">
          <p class="slide-label">${label}${kind === here ? ' <span class="muted small">(this device)</span>' : ''}</p>
          <p class="muted small">Speed</p>
          <div class="chips">
            ${SPEEDS.map((n) => `<button type="button" class="chip${cfg[kind].secs === n ? ' active' : ''}" data-secs="${n}" aria-pressed="${cfg[kind].secs === n}">${n} s</button>`).join('')}
          </div>
          <p class="muted small">Transition</p>
          <div class="seg">
            ${EFFECTS.map(([id, name]) => `<button type="button" class="seg-btn${cfg[kind].effect === id ? ' active' : ''}" data-effect="${id}" aria-pressed="${cfg[kind].effect === id}">${name}</button>`).join('')}
          </div>
        </div>`).join('')}
      <p class="form-msg${error ? ' error' : ''}" aria-live="polite">${msg}</p>`;
  };

  container.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-secs], button[data-effect]');
    if (!btn) return;
    const kind = btn.closest('.slide-kind').dataset.kind;
    const before = cfg;
    cfg = { ...cfg, [kind]: { ...cfg[kind] } };
    if (btn.dataset.secs) cfg[kind].secs = Number(btn.dataset.secs);
    else cfg[kind].effect = btn.dataset.effect;
    draw('Saving...');
    try {
      await updateSettings({ slideshow: cfg });
      applySlideshow(cfg);
      draw('Saved.');
    } catch (err) {
      console.error(err);
      cfg = before;
      draw('Could not save. Please try again.', true);
    }
  });

  draw();
}
