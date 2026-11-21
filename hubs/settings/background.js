// Settings: Background. Rotate daily (default) or pin one scene.
// Each scene shows a small preview (day image in light mode, night in dark).
// Scenes without images yet are shown as "coming soon" and cannot be picked.
import { SCENES, readyScenes, getBackgroundPref, setBackgroundPref, sceneForDay, sceneImages } from '../../core/background.js';
import { esc } from '../../core/wellbeing.js';

export async function renderBackgroundSettings(container) {
  const draw = (msg = '', error = false) => {
    const pref = getBackgroundPref();
    const ready = new Set(readyScenes().map((s) => s.id));
    const today = sceneForDay();
    container.innerHTML = `
      <p class="muted small">A different scene each day, the same on all your devices. Day images show in light mode, night images in dark mode.</p>
      <div class="bg-choices">
        <button class="pill-btn${pref === 'rotate' ? ' active' : ''}" data-bg="rotate" aria-pressed="${pref === 'rotate'}">Rotate daily</button>
      </div>
      <div class="bg-grid">
        ${SCENES.map((s) => {
          const ok = ready.has(s.id);
          const img = sceneImages(s);
          return `<button class="bg-card${pref === s.id ? ' active' : ''}" data-bg="${s.id}" aria-pressed="${pref === s.id}" ${ok ? '' : 'disabled'}>
            ${ok ? `<img class="bg-thumb bg-thumb-day" src="${img.day}" alt="" loading="lazy">
                    <img class="bg-thumb bg-thumb-night" src="${img.night}" alt="" loading="lazy">`
              : '<span class="bg-thumb bg-thumb-empty"></span>'}
            <span class="bg-label">${esc(s.label)}${ok ? '' : '<br><span class="small muted">Coming soon</span>'}</span>
          </button>`;
        }).join('')}
      </div>
      <p class="muted small">${pref === 'rotate' && today ? `Today's scene: ${esc(today.label)}.` : ''}</p>
      <p class="form-msg${error ? ' error' : ''}" aria-live="polite">${esc(msg)}</p>`;
  };
  container.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-bg]');
    if (!btn || btn.disabled) return;
    try {
      await setBackgroundPref(btn.dataset.bg);
      draw('Saved.');
    } catch (err) {
      console.error(err);
      draw('That did not save. Please try again.', true);
    }
  });
  draw();
}
