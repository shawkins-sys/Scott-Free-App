// Tools page: Last done sheet (Scott, 25/11/2026). A form (name, every X days
// optional, last done date) and the items: overdue first, each with how long
// ago it was done, when it is due, Done today, Edit, Delete and its history.
// Data and rules live in core/lastdone.js.
import { listLastDone, cachedLastDone, addItem, editItem, markDone, deleteItem, info, sinceText, dueText } from '../../core/lastdone.js';
import { formatKey } from '../../core/keydates.js';
import { todayKey } from '../../core/date.js';
import { esc } from '../../core/wellbeing.js';

const rowHtml = (x) => {
  const i = info(x);
  const due = dueText(i);
  return `
    <li class="ld-item ${i.state}" data-id="${esc(x.id)}">
      <span class="ld-main">
        <span class="ld-title">${esc(x.title)}</span>
        <span class="ld-since">${sinceText(i.since)}</span>
        <span class="muted small">${x.every ? `Every ${x.every} day${x.every === 1 ? '' : 's'}` : 'No set interval'}${due ? ` &middot; <span class="ld-due">${due}</span>` : ''}</span>
        <span class="phrase-actions">
          ${i.since > 0 ? '<button type="button" class="link-btn" data-act="done">Done today</button>' : ''}
          <button type="button" class="link-btn" data-act="edit">Edit</button>
          <button type="button" class="link-btn" data-act="delete">Delete</button>
          ${x.dates.length > 1 ? '<button type="button" class="link-btn" data-act="history">History</button>' : ''}
        </span>
        <span class="muted small ld-history" hidden>Done ${x.dates.map(formatKey).join(', ')}</span>
      </span>
    </li>`;
};

export async function renderLastDone(card) {
  card.innerHTML = `
    <div class="card-row"><h2 class="card-title">Last done</h2></div>
    <form class="cd-form ld-form" novalidate>
      <label class="field"><span>What do you want to track?</span>
        <input name="title" maxlength="60" placeholder="Tank water change" autocomplete="off"></label>
      <div class="ld-two">
        <label class="field"><span>Every (days, optional)</span>
          <input name="every" type="number" inputmode="numeric" min="1" max="3650" placeholder="7"></label>
        <label class="field"><span>Last done</span><input name="date" type="date" max="${todayKey()}" value="${todayKey()}"></label>
      </div>
      <p class="form-msg" aria-live="polite"></p>
      <div class="cd-buttons">
        <button class="primary-btn" type="submit">Add</button>
        <button class="link-btn" type="button" data-cancel hidden>Cancel</button>
      </div>
    </form>
    <ul class="cd-list ld-list"></ul>`;
  const f = card.querySelector('form');
  const el = f.elements;
  const msg = f.querySelector('.form-msg');
  const submit = f.querySelector('[type=submit]');
  const cancel = f.querySelector('[data-cancel]');
  const listEl = card.querySelector('.ld-list');
  let items = cachedLastDone();
  let editing = null;
  let busy = false;

  const draw = () => {
    listEl.innerHTML = items.length ? items.map(rowHtml).join('')
      : '<li class="muted">Nothing yet. Add things like a tank water change, filter clean, bedding or a haircut.</li>';
  };
  const setMsg = (text, error = false) => { msg.textContent = text; msg.classList.toggle('error', error); };
  const reset = () => { editing = null; f.reset(); el.date.value = todayKey(); submit.textContent = 'Add'; cancel.hidden = true; };
  const save = async (fn) => {
    if (busy) return;
    busy = true;
    try { items = await fn(); draw(); setMsg(''); } catch (err) {
      console.error(err);
      setMsg('That did not save. Please try again.', true);
    } finally { busy = false; }
  };

  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = el.title.value.trim();
    const date = el.date.value;
    const every = el.every.value ? parseInt(el.every.value, 10) : null;
    if (!title || !date) { setMsg('Please fill in the name and the date it was last done.', true); return; }
    if (date > todayKey()) { setMsg('The last done date cannot be in the future.', true); return; }
    if (every !== null && !(every >= 1 && every <= 3650)) { setMsg('Every should be between 1 and 3650 days, or left empty.', true); return; }
    const id = editing;
    save(async () => { const l = id ? await editItem(id, title, every, date) : await addItem(title, every, date); reset(); return l; });
  });
  f.addEventListener('input', () => setMsg(''));
  cancel.addEventListener('click', () => { reset(); setMsg(''); });

  listEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const row = btn.closest('[data-id]');
    const x = items.find((y) => y.id === row.dataset.id);
    if (!x) return;
    const act = btn.dataset.act;
    if (act === 'done') save(() => markDone(x.id));
    if (act === 'history') { const h = row.querySelector('.ld-history'); h.hidden = !h.hidden; }
    if (act === 'edit') {
      editing = x.id; el.title.value = x.title; el.every.value = x.every || ''; el.date.value = x.dates[0];
      submit.textContent = 'Save changes'; cancel.hidden = false;
      f.scrollIntoView({ block: 'nearest' });
    }
    if (act === 'delete' && window.confirm(`Delete ${x.title}?`)) {
      save(async () => { const l = await deleteItem(x.id); if (editing === x.id) reset(); return l; });
    }
  });

  draw();
  try { items = await listLastDone(); draw(); } catch (err) { console.warn('Last done not loaded', err); }
}
