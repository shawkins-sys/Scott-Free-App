// Settings, Timer presets: the quick-start buttons in Plan, Timers (up to 8).
import { loadPresets, savePresets, presetName, DEFAULT_PRESETS } from '../../core/timers.js';

export async function renderTimerSettings(container) {
  let presets = await loadPresets();
  const draw = (text = '', error = false) => {
    container.innerHTML = `
      <p class="muted small">Quick-start buttons in Plan, Timers. Up to 8. Tap one to remove it.</p>
      <div class="chips tm-set">
        ${presets.map((m) => `<button type="button" class="chip" data-min="${m}" aria-label="Remove ${presetName(m)}">${presetName(m)} &times;</button>`).join('')}
      </div>
      <form class="tm-set-add" novalidate>
        <label class="field"><span>Add a preset (minutes)</span>
          <input name="min" type="number" inputmode="numeric" min="1" max="600" placeholder="e.g. 20"></label>
        <button class="primary-btn" type="submit"${presets.length >= 8 ? ' disabled' : ''}>Add</button>
      </form>
      <button type="button" class="link-btn" data-reset>Reset to 1, 5, 10, 15 and 30 min</button>
      <p class="form-msg${error ? ' error' : ''}" aria-live="polite">${text}</p>`;
  };
  const store = async (next) => {
    const before = presets;
    presets = next;
    draw('Saving...');
    try { presets = await savePresets(next); draw('Saved.'); }
    catch (err) { console.error(err); presets = before; draw('That did not save. Please try again.', true); }
  };

  container.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-min]');
    if (chip) {
      if (presets.length <= 1) { draw('Keep at least one preset.', true); return; }
      store(presets.filter((m) => m !== Number(chip.dataset.min)));
    }
    if (e.target.closest('[data-reset]')) store(DEFAULT_PRESETS.slice());
  });
  container.addEventListener('submit', (e) => {
    e.preventDefault();
    const n = Math.floor(Number(e.target.elements.min.value));
    if (!(n >= 1 && n <= 600)) { draw('Enter a number of minutes from 1 to 600.', true); return; }
    if (presets.includes(n)) { draw('That preset is already there.', true); return; }
    store([...presets, n]);
  });
  draw();
}
