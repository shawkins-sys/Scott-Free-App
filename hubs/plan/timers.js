// Plan hub: Timers card. Presets (from Settings) or a custom time, an
// optional name, and the running, paused and finished timers on this device.
import { esc } from '../../core/wellbeing.js';
import {
  listTimers, startTimer, pauseTimer, resumeTimer, addMinute, removeTimer,
  remainingMs, formatMs, finishedText, cachedPresets, loadPresets, presetName,
} from '../../core/timers.js';

export async function renderTimers(card) {
  let presets = cachedPresets();
  card.innerHTML = `
    <div class="card-row"><h2 class="card-title">Timers</h2></div>
    <p class="muted small tm-note">Timers ring while Scott Hub is open on this device. For wake-up alarms, use your phone's Clock app.</p>
    <div class="tm-presets chips"></div>
    <form class="tm-custom" novalidate>
      <label class="field tm-name"><span>Name (optional)</span><input name="name" maxlength="40" placeholder="e.g. Pasta" autocomplete="off"></label>
      <div class="tm-time">
        <label class="field"><span>Min</span><input name="min" type="number" inputmode="numeric" min="0" max="600" placeholder="0"></label>
        <label class="field"><span>Sec</span><input name="sec" type="number" inputmode="numeric" min="0" max="59" placeholder="0"></label>
        <button class="primary-btn" type="submit">Start</button>
      </div>
      <p class="form-msg" aria-live="polite"></p>
    </form>
    <ul class="tm-list"></ul>`;

  const presetsEl = card.querySelector('.tm-presets');
  const form = card.querySelector('.tm-custom');
  const msg = form.querySelector('.form-msg');
  const listEl = card.querySelector('.tm-list');
  const nameVal = () => form.elements.name.value;
  const clearName = () => { form.elements.name.value = ''; };

  const drawPresets = () => {
    presetsEl.innerHTML = presets.map((m) => `<button type="button" class="chip tm-preset" data-min="${m}">${presetName(m)}</button>`).join('');
  };
  drawPresets();
  loadPresets().then((p) => { if (p.join() !== presets.join()) { presets = p; drawPresets(); } });

  presetsEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-min]');
    if (!b) return;
    const mins = Number(b.dataset.min);
    startTimer(mins * 60000, nameVal() || `${presetName(mins)} timer`);
    clearName();
    msg.textContent = '';
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const min = Math.max(0, Math.floor(Number(form.elements.min.value) || 0));
    const sec = Math.max(0, Math.floor(Number(form.elements.sec.value) || 0));
    const ms = (min * 60 + Math.min(sec, 59)) * 1000;
    if (!ms) { msg.textContent = 'Enter minutes or seconds.'; msg.classList.add('error'); return; }
    msg.textContent = '';
    msg.classList.remove('error');
    startTimer(ms, nameVal());
    form.reset();
  });

  // Rows are rebuilt when the list changes; only the countdowns change each second.
  let shownKey = '';
  const drawList = () => {
    const items = listTimers().sort((a, b) => (!!a.finishedAt - !!b.finishedAt) || (remainingMs(a) - remainingMs(b)));
    const key = items.map((t) => `${t.id}:${t.endsAt ? 'r' : t.finishedAt ? 'f' : 'p'}:${t.total}`).join();
    if (key !== shownKey) {
      shownKey = key;
      listEl.innerHTML = items.map((t) => {
        if (t.finishedAt) {
          return `<li class="tm-item done" data-id="${t.id}">
            <div class="tm-main"><span class="tm-title">${esc(t.name)}</span><span class="muted small">${finishedText(t)}</span></div>
            <div class="tm-btns"><button type="button" class="pill-btn" data-act="remove">Clear</button></div></li>`;
        }
        return `<li class="tm-item${t.endsAt ? '' : ' paused'}" data-id="${t.id}">
          <div class="tm-main"><span class="tm-title">${esc(t.name)}</span><span class="tm-left" data-left></span>
            <span class="tm-bar"><span data-bar></span></span></div>
          <div class="tm-btns">
            <button type="button" class="pill-btn" data-act="add">+1 min</button>
            <button type="button" class="pill-btn" data-act="${t.endsAt ? 'pause' : 'resume'}">${t.endsAt ? 'Pause' : 'Resume'}</button>
            <button type="button" class="pill-btn" data-act="remove">Cancel</button>
          </div></li>`;
      }).join('');
    }
    for (const t of items) {
      if (t.finishedAt) continue;
      const row = listEl.querySelector(`[data-id="${t.id}"]`);
      if (!row) continue;
      const left = remainingMs(t);
      row.querySelector('[data-left]').textContent = formatMs(left) + (t.endsAt ? '' : ' (paused)');
      row.querySelector('[data-bar]').style.width = `${Math.min(100, (1 - left / t.total) * 100)}%`;
    }
  };

  listEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const id = b.closest('[data-id]').dataset.id;
    ({ add: addMinute, pause: pauseTimer, resume: resumeTimer, remove: removeTimer })[b.dataset.act](id);
  });

  const onChange = () => { if (!document.contains(card)) { window.removeEventListener('sf:timers', onChange); window.removeEventListener('sf:timers-tick', onChange); return; } drawList(); };
  window.addEventListener('sf:timers', onChange);
  window.addEventListener('sf:timers-tick', onChange);
  drawList();
}
