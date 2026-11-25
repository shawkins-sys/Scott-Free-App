// Tools page: Quick notes sheet (phase 3; Scott, 25/11/2026). A box to jot a
// note, then the notes: pinned first, newest next, each with a tick circle and
// Pin, Edit and Delete. Ticked notes move to a Done group with "Clear ticked".
// Data and rules live in core/notes.js.
import { listNotes, cachedNotes, addNote, editNote, togglePin, toggleDone, deleteNote, clearDone, MAX_LEN } from '../../core/notes.js';
import { esc } from '../../core/wellbeing.js';

const TICK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4h6l-1 6 4 3v2H6v-2l4-3zM12 15v6"/></svg>';

const rowHtml = (n) => `
  <li class="nt-item${n.done ? ' done' : ''}${n.pinned ? ' pinned' : ''}" data-id="${esc(n.id)}">
    <button type="button" class="nt-tick" data-act="tick" aria-label="${n.done ? 'Untick' : 'Tick'} note">${n.done ? TICK : ''}</button>
    <span class="nt-main">
      <span class="nt-text">${n.pinned ? `<span class="nt-pin">${PIN}</span>` : ''}${esc(n.text).replace(/\n/g, '<br>')}</span>
      <span class="phrase-actions">
        ${n.done ? '' : `<button type="button" class="link-btn" data-act="pin">${n.pinned ? 'Unpin' : 'Pin'}</button>
        <button type="button" class="link-btn" data-act="edit">Edit</button>`}
        <button type="button" class="link-btn" data-act="delete">Delete</button>
      </span>
    </span>
  </li>`;

export async function renderNotes(card) {
  card.innerHTML = `
    <div class="card-row"><h2 class="card-title">Quick notes</h2></div>
    <form class="nt-form" novalidate>
      <label class="field"><span class="sr-only">Note</span>
        <textarea name="text" rows="3" maxlength="${MAX_LEN}" placeholder="Jot something down"></textarea></label>
      <p class="form-msg" aria-live="polite"></p>
      <div class="cd-buttons">
        <button class="primary-btn" type="submit">Add note</button>
        <button class="link-btn" type="button" data-cancel hidden>Cancel</button>
      </div>
    </form>
    <ul class="nt-list"></ul>
    <div class="nt-done" hidden>
      <div class="card-row nt-done-head"><span class="muted small nt-done-count"></span><button type="button" class="link-btn" data-clear>Clear ticked</button></div>
      <ul class="nt-list nt-done-list"></ul>
    </div>`;
  const f = card.querySelector('form');
  const box = f.elements.text;
  const msg = f.querySelector('.form-msg');
  const submit = f.querySelector('[type=submit]');
  const cancel = f.querySelector('[data-cancel]');
  const openEl = card.querySelector('.nt-list');
  const doneWrap = card.querySelector('.nt-done');
  let notes = cachedNotes();
  let editing = null;
  let busy = false;

  const draw = () => {
    const open = notes.filter((n) => !n.done);
    const done = notes.filter((n) => n.done);
    openEl.innerHTML = open.length ? open.map(rowHtml).join('') : '<li class="muted">No notes yet.</li>';
    doneWrap.hidden = !done.length;
    card.querySelector('.nt-done-list').innerHTML = done.map(rowHtml).join('');
    card.querySelector('.nt-done-count').textContent = `Done (${done.length})`;
  };
  const setMsg = (text, error = false) => { msg.textContent = text; msg.classList.toggle('error', error); };
  const reset = () => { editing = null; f.reset(); submit.textContent = 'Add note'; cancel.hidden = true; };
  const save = async (fn) => {
    if (busy) return;
    busy = true;
    try { notes = await fn(); draw(); setMsg(''); } catch (err) {
      console.error(err);
      setMsg('That did not save. Please try again.', true);
    } finally { busy = false; }
  };

  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = box.value.trim();
    if (!text) { setMsg('Type a note first.', true); return; }
    const id = editing;
    save(async () => { const l = id ? await editNote(id, text) : await addNote(text); reset(); return l; });
  });
  box.addEventListener('input', () => setMsg(''));
  cancel.addEventListener('click', () => { reset(); setMsg(''); });

  card.addEventListener('click', (e) => {
    if (e.target.closest('[data-clear]')) {
      if (window.confirm('Clear all ticked notes?')) save(clearDone);
      return;
    }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const n = notes.find((x) => x.id === btn.closest('[data-id]').dataset.id);
    if (!n) return;
    const act = btn.dataset.act;
    if (act === 'tick') save(() => toggleDone(n.id, !n.done));
    if (act === 'pin') save(() => togglePin(n.id, !n.pinned));
    if (act === 'edit') {
      editing = n.id; box.value = n.text;
      submit.textContent = 'Save changes'; cancel.hidden = false;
      box.focus();
      f.scrollIntoView({ block: 'nearest' });
    }
    if (act === 'delete' && window.confirm('Delete this note?')) {
      save(async () => { const l = await deleteNote(n.id); if (editing === n.id) reset(); return l; });
    }
  });

  draw();
  try { notes = await listNotes(); draw(); } catch (err) { console.warn('Notes not loaded', err); }
}
