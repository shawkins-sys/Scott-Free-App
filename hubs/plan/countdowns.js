// Tools page: Countdowns sheet (phase 2; Scott, 25/11/2026). Add a name and a
// date; rows show the days left in large type, nearest first, with Edit and
// Delete. Data and rules live in core/countdowns.js.
import { listCountdowns, cachedCountdowns, addCountdown, editCountdown, deleteCountdown, daysTo, formatKey } from '../../core/countdowns.js';
import { todayKey } from '../../core/date.js';
import { esc } from '../../core/wellbeing.js';

const rowHtml = (c) => {
  const days = daysTo(c);
  return `
    <li class="cd-item" data-id="${esc(c.id)}">
      <span class="cd-days">${days === 0 ? 'Today' : days}<small>${days === 0 ? '' : days === 1 ? 'day' : 'days'}</small></span>
      <span class="cd-main">
        <span class="cd-title">${esc(c.title)}</span>
        <span class="muted small">${formatKey(c.date)}</span>
        <span class="phrase-actions">
          <button type="button" class="link-btn" data-act="edit">Edit</button>
          <button type="button" class="link-btn" data-act="delete">Delete</button>
        </span>
      </span>
    </li>`;
};

export async function renderCountdowns(card) {
  card.innerHTML = `
    <div class="card-row"><h2 class="card-title">Countdowns</h2></div>
    <form class="cd-form" novalidate>
      <label class="field"><span>What are you counting down to?</span>
        <input name="title" maxlength="60" placeholder="Holiday to Spain" autocomplete="off"></label>
      <label class="field"><span>Date</span><input name="date" type="date" min="${todayKey()}"></label>
      <p class="form-msg" aria-live="polite"></p>
      <div class="cd-buttons">
        <button class="primary-btn" type="submit">Add</button>
        <button class="link-btn" type="button" data-cancel hidden>Cancel</button>
      </div>
    </form>
    <ul class="cd-list"></ul>`;
  const f = card.querySelector('form');
  const el = f.elements;
  const msg = f.querySelector('.form-msg');
  const submit = f.querySelector('[type=submit]');
  const cancel = f.querySelector('[data-cancel]');
  const listEl = card.querySelector('.cd-list');
  let items = cachedCountdowns();
  let editing = null;

  const draw = () => {
    listEl.innerHTML = items.length ? items.map(rowHtml).join('')
      : '<li class="muted">Nothing yet. Add a holiday, a trip or anything you are looking forward to.</li>';
  };
  const setMsg = (text, error = false) => { msg.textContent = text; msg.classList.toggle('error', error); };
  const reset = () => { editing = null; f.reset(); submit.textContent = 'Add'; cancel.hidden = true; };

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = el.title.value.trim();
    const date = el.date.value;
    if (!title || !date) { setMsg('Please fill in what it is and the date.', true); return; }
    if (date < todayKey()) { setMsg('Please pick today or a later date.', true); return; }
    submit.disabled = true;
    try {
      items = editing ? await editCountdown(editing, title, date) : await addCountdown(title, date);
      reset(); setMsg(''); draw();
    } catch (err) {
      console.error(err);
      setMsg('That did not save. Please try again.', true);
    } finally { submit.disabled = false; }
  });
  f.addEventListener('input', () => setMsg(''));
  cancel.addEventListener('click', () => { reset(); setMsg(''); });

  listEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const c = items.find((x) => x.id === btn.closest('[data-id]').dataset.id);
    if (!c) return;
    if (btn.dataset.act === 'edit') {
      editing = c.id; el.title.value = c.title; el.date.value = c.date;
      submit.textContent = 'Save changes'; cancel.hidden = false; el.title.focus();
      return;
    }
    if (!window.confirm(`Delete ${c.title}?`)) return;
    try { items = await deleteCountdown(c.id); if (editing === c.id) reset(); draw(); } catch (err) {
      console.error(err); setMsg('That did not save. Please try again.', true);
    }
  });

  draw();
  try { items = await listCountdowns(); draw(); } catch (err) { console.warn('Countdowns not loaded', err); }
}
