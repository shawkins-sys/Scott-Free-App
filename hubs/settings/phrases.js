// Settings: Daily phrases (add, edit, delete, pin, tough days).
// Moved from the Wellbeing hub on 15/11/2026.
import { listPhrases, ensureSeedPhrase, addPhrase, updatePhrase, deletePhrase, setPinned, esc } from '../../core/wellbeing.js';

function phraseRow(p) {
  return `
    <li class="phrase-item" data-id="${p.id}">
      <p class="phrase-text">${esc(p.text)}</p>
      <div class="phrase-tags">
        ${p.pinned ? '<span class="tag">Pinned</span>' : ''}
        ${p.tough_days ? '<span class="tag">For tough days</span>' : ''}
      </div>
      <div class="phrase-actions">
        <button class="link-btn" data-act="pin">${p.pinned ? 'Unpin' : 'Pin'}</button>
        <button class="link-btn" data-act="tough">${p.tough_days ? 'Not for tough days' : 'For tough days'}</button>
        <button class="link-btn" data-act="edit">Edit</button>
        <button class="link-btn" data-act="delete">Delete</button>
      </div>
    </li>`;
}

export async function renderPhraseSettings(container) {
  container.innerHTML = `
    <p class="muted small">One phrase shows under the greeting each day after your check-in. A pinned phrase shows every day. Tough days phrases are used when mood is 1 or 2, or either stress rating is 4 or 5.</p>
    <form class="phrase-add">
      <label class="field"><span>New phrase</span><input name="text" maxlength="200" autocomplete="off" required></label>
      <label class="check"><input type="checkbox" name="tough"> For tough days</label>
      <button class="primary-btn" type="submit">Add phrase</button>
    </form>
    <p class="form-msg" aria-live="polite"></p>
    <ul class="phrase-list"></ul>`;

  const listEl = container.querySelector('.phrase-list');
  const msg = container.querySelector('.form-msg');
  let phrases = [];

  const fail = (err) => {
    console.error(err);
    msg.classList.add('error');
    msg.textContent = 'That did not save. Please try again.';
  };

  const load = async () => {
    phrases = await ensureSeedPhrase(await listPhrases());
    listEl.innerHTML = phrases.length ? phrases.map(phraseRow).join('') : '<li class="muted">No phrases yet.</li>';
  };

  container.querySelector('.phrase-add').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const text = form.elements.text.value.trim();
    if (!text) return;
    msg.classList.remove('error');
    msg.textContent = '';
    try { await addPhrase(text, form.elements.tough.checked); form.reset(); await load(); } catch (err) { fail(err); }
  });

  listEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const li = btn.closest('[data-id]');
    const p = phrases.find((x) => x.id === li.dataset.id);
    if (!p) return;
    msg.classList.remove('error');
    msg.textContent = '';
    try {
      if (btn.dataset.act === 'pin') await setPinned(p.id, !p.pinned);
      if (btn.dataset.act === 'tough') await updatePhrase(p.id, { tough_days: !p.tough_days });
      if (btn.dataset.act === 'delete') {
        if (!window.confirm('Delete this phrase?')) return;
        await deletePhrase(p.id);
      }
      if (btn.dataset.act === 'edit') {
        li.innerHTML = `
          <form class="phrase-edit">
            <label class="field"><span>Edit phrase</span><input name="text" maxlength="200" value="${esc(p.text)}" required></label>
            <button class="primary-btn" type="submit">Save</button>
            <button class="link-btn" type="button" data-cancel>Cancel</button>
          </form>`;
        const f = li.querySelector('form');
        f.elements.text.focus();
        f.querySelector('[data-cancel]').addEventListener('click', load);
        f.addEventListener('submit', async (ev) => {
          ev.preventDefault();
          const text = f.elements.text.value.trim();
          if (!text) return;
          try { await updatePhrase(p.id, { text }); await load(); } catch (err) { fail(err); }
        });
        return;
      }
      await load();
    } catch (err) { fail(err); }
  });

  await load();
}
