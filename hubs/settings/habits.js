// Settings: Habits asked about in the morning check-in (about yesterday).
// Habits are turned off rather than deleted, so their history is kept.
import { getHabits, saveHabits, newHabitKey } from '../../core/habits.js';
import { esc } from '../../core/wellbeing.js';
import { openOverlay } from '../../core/overlay.js';

function row(h, i) {
  const off = h.active === false;
  return `
    <li class="habit-set-item${off ? ' off' : ''}" data-i="${i}">
      <div class="habit-set-main">
        <span>${esc(h.label)}${off ? ' <span class="tag">Off</span>' : ''}</span>
        <span class="muted small">${h.options.map(esc).join(' / ')}</span>
      </div>
      <div class="phrase-actions">
        ${i > 0 ? '<button class="link-btn" data-act="up">Move up</button>' : ''}
        <button class="link-btn" data-act="edit">Edit</button>
        <button class="link-btn" data-act="toggle">${off ? 'Turn on' : 'Turn off'}</button>
      </div>
    </li>`;
}

function openForm(habit, onSave) {
  const close = openOverlay(habit ? 'Edit habit' : 'Add habit', (body) => {
    const o = habit ? habit.options : ['None', '', ''];
    body.innerHTML = `
      <form novalidate>
        <label class="field"><span>Habit (asked about yesterday)</span>
          <input name="label" maxlength="40" required value="${esc(habit ? habit.label : '')}" placeholder="e.g. Takeaway"></label>
        <label class="field"><span>Answer 1: did not (e.g. None or No)</span>
          <input name="a0" maxlength="20" required value="${esc(o[0] || '')}"></label>
        <label class="field"><span>Answer 2</span>
          <input name="a1" maxlength="20" required value="${esc(o[1] || '')}" placeholder="e.g. Yes or A bit"></label>
        <label class="field"><span>Answer 3 (optional, leave blank for two answers)</span>
          <input name="a2" maxlength="20" value="${esc(o[2] || '')}" placeholder="e.g. Too much"></label>
        <p class="form-msg" aria-live="polite"></p>
        <button class="primary-btn" type="submit">${habit ? 'Save changes' : 'Add habit'}</button>
      </form>`;
    const f = body.querySelector('form');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const el = f.elements;
      const msg = f.querySelector('.form-msg');
      const label = el.label.value.trim();
      const options = [el.a0.value, el.a1.value, el.a2.value].map((v) => v.trim()).filter(Boolean);
      if (!label || !el.a0.value.trim() || !el.a1.value.trim()) {
        msg.classList.add('error');
        msg.textContent = 'Please fill in the habit and at least the first two answers.';
        return;
      }
      try {
        await onSave({ label, options });
        close();
      } catch (err) {
        console.error(err);
        msg.classList.add('error');
        msg.textContent = 'That did not save. Please try again.';
      }
    });
  });
}

export async function renderHabitSettings(container) {
  container.innerHTML = `
    <p class="muted small">Asked in the morning check-in about yesterday, to spot patterns with mood and sleep. The first answer always means you did not. Turning a habit off keeps its history.</p>
    <button class="pill-btn" data-add>Add habit</button>
    <p class="form-msg" aria-live="polite"></p>
    <ul class="phrase-list habit-set-list"></ul>`;
  const listEl = container.querySelector('.habit-set-list');
  const msg = container.querySelector('.form-msg');
  let habits = (await getHabits()).map((h) => ({ ...h }));

  const draw = () => { listEl.innerHTML = habits.map(row).join(''); };
  const persist = async (next) => {
    msg.textContent = '';
    msg.classList.remove('error');
    await saveHabits(next);
    habits = next;
    draw();
  };
  const fail = (err) => { console.error(err); msg.classList.add('error'); msg.textContent = 'That did not save. Please try again.'; };

  container.querySelector('[data-add]').addEventListener('click', () => openForm(null, ({ label, options }) =>
    persist([...habits, { key: newHabitKey(label, habits), label, options, active: true }])));

  listEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const i = Number(btn.closest('[data-i]').dataset.i);
    const next = habits.map((h) => ({ ...h }));
    try {
      if (btn.dataset.act === 'edit') {
        openForm(habits[i], (fields) => { next[i] = { ...next[i], ...fields }; return persist(next); });
        return;
      }
      if (btn.dataset.act === 'toggle') next[i].active = next[i].active === false;
      if (btn.dataset.act === 'up') [next[i - 1], next[i]] = [next[i], next[i - 1]];
      await persist(next);
    } catch (err) { fail(err); }
  });
  draw();
}
