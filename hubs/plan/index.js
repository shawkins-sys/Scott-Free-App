// Plan hub: calendar agenda (today plus the next 7 days) and key dates
// (birthdays and life admin).
import { renderAgenda } from '../../core/calendar.js';
import { listKeyDates, saveKeyDate, deleteKeyDate, nextDate, advancedDate, daysBetween,
  whenText, displayTitle, ageOn, formatKey, DEFAULT_LEAD, leadDays } from '../../core/keydates.js';
import { todayKey } from '../../core/date.js';
import { esc } from '../../core/wellbeing.js';
import { openOverlay } from '../../core/overlay.js';

const REPEATS = [
  ['none', 'Does not repeat'],
  ['yearly', 'Every year'],
  ['every_n_months', 'Every X months'],
  ['every_n_years', 'Every X years'],
];

function repeatText(item) {
  if (item.kind === 'birthday') return 'Every year';
  const n = item.repeat_every || 1;
  if (item.repeat_rule === 'yearly') return 'Every year';
  if (item.repeat_rule === 'every_n_months') return `Every ${n} month${n === 1 ? '' : 's'}`;
  if (item.repeat_rule === 'every_n_years') return `Every ${n} year${n === 1 ? '' : 's'}`;
  return 'Does not repeat';
}

function row(item, today) {
  const date = nextDate(item, today);
  const days = daysBetween(today, date);
  const age = ageOn(item, date);
  const soon = days <= leadDays(item);
  return `
    <li class="kd-item${days < 0 ? ' overdue' : soon ? ' soon' : ''}" data-id="${item.id}">
      <div class="kd-main">
        <span class="kd-title">${esc(displayTitle(item))}</span>
        <span class="kd-when">${formatKey(date)}, ${whenText(days)}${age ? ` (turns ${age})` : ''}</span>
        <span class="muted small">${item.kind === 'birthday' ? 'Birthday' : 'Life admin'} &middot; ${repeatText(item)}</span>
        ${item.gift_ideas ? `<span class="muted small">Gift ideas: ${esc(item.gift_ideas)}</span>` : ''}
        ${item.notes ? `<span class="muted small">${esc(item.notes)}</span>` : ''}
      </div>
      <div class="phrase-actions">
        ${item.kind === 'life_admin' ? '<button class="link-btn" data-act="done">Done</button>' : ''}
        <button class="link-btn" data-act="edit">Edit</button>
        <button class="link-btn" data-act="delete">Delete</button>
      </div>
    </li>`;
}

function formHtml(item, kind) {
  const isB = kind === 'birthday';
  const v = (k, d = '') => esc(item ? (item[k] ?? d) : d);
  const lead = item ? leadDays(item) : DEFAULT_LEAD[kind];
  return `
    <form class="kd-form" novalidate>
      <div class="yesno kd-kind">
        <button type="button" class="pill-btn${isB ? ' active' : ''}" data-kind="birthday">Birthday</button>
        <button type="button" class="pill-btn${!isB ? ' active' : ''}" data-kind="life_admin">Life admin</button>
      </div>
      <label class="field"><span>${isB ? 'Name' : 'Title (e.g. MOT, car tax)'}</span>
        <input name="title" maxlength="80" required value="${v('title')}"></label>
      <label class="field"><span>${isB ? 'Birthday (any year)' : 'Due date'}</span>
        <input name="due_date" type="date" required value="${v('due_date')}"></label>
      ${isB ? `
        <label class="field"><span>Year born (optional, shows age)</span>
          <input name="birth_year" type="number" inputmode="numeric" min="1900" max="2100" value="${v('birth_year')}"></label>
        <label class="field"><span>Gift ideas (optional)</span>
          <input name="gift_ideas" maxlength="300" value="${v('gift_ideas')}"></label>` : `
        <label class="field"><span>Repeat</span>
          <select name="repeat_rule">${REPEATS.map(([val, label]) =>
            `<option value="${val}"${(item ? item.repeat_rule : 'yearly') === val ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
        <label class="field kd-every"><span>X (number of months or years)</span>
          <input name="repeat_every" type="number" inputmode="numeric" min="1" max="120" value="${v('repeat_every', '1')}"></label>
        <label class="field"><span>Notes (optional)</span>
          <input name="notes" maxlength="300" value="${v('notes')}"></label>`}
      <label class="field"><span>Remind me this many days before (and on the day)</span>
        <input name="lead" type="number" inputmode="numeric" min="0" max="365" value="${lead}"></label>
      <p class="form-msg" aria-live="polite"></p>
      <button class="primary-btn" type="submit">${item ? 'Save changes' : 'Add'}</button>
    </form>`;
}

function openForm(item, onSaved) {
  let kind = item ? item.kind : 'birthday';
  const close = openOverlay(item ? 'Edit key date' : 'Add key date', (body) => {
    const draw = () => {
      body.innerHTML = formHtml(item, kind);
      const f = body.querySelector('form');
      const el = f.elements;
      const every = f.querySelector('.kd-every');
      const syncEvery = () => { if (every) every.hidden = !/^every_n/.test(el.repeat_rule.value); };
      if (el.repeat_rule) { el.repeat_rule.addEventListener('change', syncEvery); syncEvery(); }
      if (!item) f.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => { kind = b.dataset.kind; draw(); }));
      else f.querySelector('.kd-kind').hidden = true;

      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const msg = f.querySelector('.form-msg');
        const title = el.title.value.trim();
        if (!title || !el.due_date.value) { msg.classList.add('error'); msg.textContent = 'Please fill in the name or title and the date.'; return; }
        const lead = Math.max(0, Math.min(365, parseInt(el.lead.value, 10) || 0));
        const fields = {
          kind, title, due_date: el.due_date.value,
          lead_days: lead ? [lead, 0] : [0],
        };
        if (kind === 'birthday') {
          Object.assign(fields, {
            birth_year: parseInt(el.birth_year.value, 10) || null,
            gift_ideas: el.gift_ideas.value.trim() || null,
            repeat_rule: 'yearly', repeat_every: null, notes: null,
          });
        } else {
          const rule = el.repeat_rule.value;
          Object.assign(fields, {
            repeat_rule: rule,
            repeat_every: /^every_n/.test(rule) ? Math.max(1, parseInt(el.repeat_every.value, 10) || 1) : null,
            notes: el.notes.value.trim() || null,
            birth_year: null, gift_ideas: null,
          });
        }
        try {
          await saveKeyDate(fields, item && item.id);
          close();
          await onSaved();
        } catch (err) {
          console.error(err);
          msg.classList.add('error');
          msg.textContent = 'That did not save. Please try again.';
        }
      });
    };
    draw();
  });
}

async function renderKeyDates(card) {
  card.innerHTML = `
    <div class="card-row"><h2 class="card-title">Key dates</h2><button class="pill-btn" data-add>Add</button></div>
    <p class="form-msg" aria-live="polite"></p>
    <ul class="phrase-list kd-list"><li class="muted">Loading...</li></ul>`;
  const list = card.querySelector('.kd-list');
  const msg = card.querySelector('.form-msg');
  let items = [];

  const load = async () => {
    try { items = await listKeyDates(); } catch (err) {
      console.error(err);
      list.innerHTML = '<li class="muted">Key dates are not available right now.</li>';
      return;
    }
    const today = todayKey();
    items.sort((a, b) => nextDate(a, today).localeCompare(nextDate(b, today)));
    list.innerHTML = items.length
      ? items.map((i) => row(i, today)).join('')
      : '<li class="muted">No key dates yet. Add birthdays and things like MOT, car tax or passport renewal.</li>';
  };

  card.querySelector('[data-add]').addEventListener('click', () => openForm(null, load));
  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const item = items.find((x) => x.id === btn.closest('[data-id]').dataset.id);
    if (!item) return;
    msg.textContent = '';
    msg.classList.remove('error');
    try {
      if (btn.dataset.act === 'edit') { openForm(item, load); return; }
      if (btn.dataset.act === 'delete') {
        if (!window.confirm(`Delete ${displayTitle(item)}?`)) return;
        await deleteKeyDate(item.id);
      }
      if (btn.dataset.act === 'done') {
        const next = advancedDate(item);
        if (next) {
          await saveKeyDate({ due_date: next }, item.id);
          msg.textContent = `${item.title} moved to ${formatKey(next)}.`;
        } else {
          if (!window.confirm(`${item.title} does not repeat. Remove it now it is done?`)) return;
          await deleteKeyDate(item.id);
        }
      }
      await load();
    } catch (err) {
      console.error(err);
      msg.classList.add('error');
      msg.textContent = 'That did not save. Please try again.';
    }
  });
  await load();
}

export default {
  id: 'plan',
  title: 'Plan',
  async render(container) {
    container.innerHTML = `
      <div class="card"><h2 class="card-title">Next 7 days</h2><div id="plan-agenda"></div></div>
      <div class="card" id="plan-keydates"></div>`;
    await Promise.all([
      renderAgenda(container.querySelector('#plan-agenda'), 8),
      renderKeyDates(container.querySelector('#plan-keydates')),
    ]);
  },
};
