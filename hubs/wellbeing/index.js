// Wellbeing hub: today's check-in and phrase management.
// Trends, breathing and weekly review are added in Phase 8.
import { METRICS, getTodayCheckin, listPhrases, ensureSeedPhrase, addPhrase,
  updatePhrase, deletePhrase, setPinned, esc } from '../../core/wellbeing.js';
import { renderCheckinForm, sleepOutOfRange } from '../../core/checkin.js';
import { openOverlay } from '../../core/overlay.js';

function todayCard(entry) {
  if (!entry) return '<p class="muted">No check-in yet today.</p>';
  const m = entry.metrics || {};
  const rows = METRICS.map((x) => `
    <li><span>${x.label}</span><span class="dot dot-${m[x.key]} mini" aria-label="${m[x.key]} of 5"><span>${m[x.key] ?? '-'}</span></span></li>`).join('');
  const hours = entry.hours_slept != null ? `${Number(entry.hours_slept)} h` : '-';
  return `
    <ul class="summary">${rows}
      <li><span>Hours slept</span><span${entry.hours_slept != null && sleepOutOfRange(Number(entry.hours_slept)) ? ' class="sleep-warn"' : ''}>${hours}</span></li>
      <li><span>Exercise yesterday</span><span>${entry.exercised ? 'Yes' : 'No'}</span></li>
    </ul>
    ${entry.note ? `<p class="note">${esc(entry.note)}</p>` : ''}
    <button class="pill-btn" data-edit-checkin>Edit today's check-in</button>`;
}

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

export default {
  id: 'wellbeing',
  title: 'Wellbeing',
  async render(container) {
    container.innerHTML = `
      <div class="card"><h2 class="card-title">Today</h2><div id="wb-today"><p class="muted">Loading...</p></div></div>
      <div class="card">
        <h2 class="card-title">Daily phrases</h2>
        <p class="muted small">One phrase shows under the greeting each day after your check-in. A pinned phrase shows every day. Tough days phrases are used when mood is 1 or 2, or either stress rating is 4 or 5.</p>
        <form id="wb-add" class="phrase-add">
          <label class="field"><span>New phrase</span><input name="text" maxlength="200" autocomplete="off" required></label>
          <label class="check"><input type="checkbox" name="tough"> For tough days</label>
          <button class="primary-btn" type="submit">Add phrase</button>
        </form>
        <p class="form-msg" id="wb-msg" aria-live="polite"></p>
        <ul class="phrase-list" id="wb-phrases"></ul>
      </div>`;

    const todayEl = container.querySelector('#wb-today');
    const listEl = container.querySelector('#wb-phrases');
    const msg = container.querySelector('#wb-msg');
    let phrases = [];

    const fail = (err) => {
      console.error(err);
      msg.classList.add('error');
      msg.textContent = 'That did not save. Please try again.';
    };

    const loadToday = async () => {
      const entry = await getTodayCheckin({ refresh: true });
      todayEl.innerHTML = todayCard(entry);
      const btn = todayEl.querySelector('[data-edit-checkin]');
      if (btn) btn.addEventListener('click', () => {
        const close = openOverlay("Edit today's check-in", (body) => renderCheckinForm(body, {
          existing: entry,
          submitLabel: 'Save changes',
          onSaved: async () => { close(); await loadToday(); },
        }));
      });
    };

    const loadPhrases = async () => {
      phrases = await ensureSeedPhrase(await listPhrases());
      listEl.innerHTML = phrases.length
        ? phrases.map(phraseRow).join('')
        : '<li class="muted">No phrases yet.</li>';
    };

    container.querySelector('#wb-add').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const text = form.text.value.trim();
      if (!text) return;
      msg.classList.remove('error');
      msg.textContent = '';
      try {
        await addPhrase(text, form.tough.checked);
        form.reset();
        await loadPhrases();
      } catch (err) { fail(err); }
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
          f.text.focus();
          f.querySelector('[data-cancel]').addEventListener('click', loadPhrases);
          f.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const text = f.text.value.trim();
            if (!text) return;
            try { await updatePhrase(p.id, { text }); await loadPhrases(); } catch (err) { fail(err); }
          });
          return;
        }
        await loadPhrases();
      } catch (err) { fail(err); }
    });

    await Promise.all([loadToday(), loadPhrases()]);
  },
};
