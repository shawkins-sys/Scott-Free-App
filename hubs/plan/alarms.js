// Plan hub, wall display only: Alarms card. Name, time, repeat days (none =
// once), on/off per alarm. Kept on this tablet (core/alarms.js).
import { esc } from '../../core/wellbeing.js';
import { DAYS, listAlarms, saveAlarm, setAlarmOn, deleteAlarm, daysText, nextAlarm } from '../../core/alarms.js';
import { audioReady } from '../../core/timers.js';

export function renderAlarms(card) {
  let editing = null; // alarm id, 'new' or null

  const formHtml = (a) => `
    <form class="al-form" novalidate>
      <label class="field"><span>Name</span><input name="name" maxlength="40" placeholder="e.g. Bins out" value="${a ? esc(a.name) : ''}" autocomplete="off"></label>
      <label class="field"><span>Time</span><input name="time" type="time" required value="${a ? a.time : '07:00'}"></label>
      <p class="muted small">Repeat (leave all off for once)</p>
      <div class="chips al-days">
        ${DAYS.map((d, i) => `<button type="button" class="chip${a && a.days.includes(i) ? ' active' : ''}" data-day="${i}" aria-pressed="${!!(a && a.days.includes(i))}">${d}</button>`).join('')}
      </div>
      <div class="btn-row">
        <button class="primary-btn" type="submit">Save alarm</button>
        <button class="pill-btn" type="button" data-cancel>Cancel</button>
      </div>
    </form>`;

  const draw = () => {
    if (!document.contains(card)) { window.removeEventListener('sf:alarms', draw); window.removeEventListener('sf:audio-ready', draw); return; }
    const items = listAlarms();
    const showHint = !audioReady() && nextAlarm();
    card.innerHTML = `
      <div class="card-row"><h2 class="card-title">Alarms</h2>
        ${editing ? '' : '<button class="pill-btn" type="button" data-add>Add alarm</button>'}</div>
      <p class="muted small">Alarms are kept on this wall display and ring here, even before the check-in.</p>
      ${showHint ? '<p class="al-hint">Tap anywhere once so alarms can make a sound. The screen has not been touched since the app last loaded.</p>' : ''}
      ${editing === 'new' ? formHtml(null) : ''}
      <ul class="al-list">
        ${items.length ? items.map((a) => editing === a.id ? `<li class="al-item editing">${formHtml(a)}</li>` : `
          <li class="al-item${a.on ? '' : ' off'}" data-id="${a.id}">
            <div class="al-main"><span class="al-time">${a.time}</span>
              <span class="al-name">${esc(a.name)}</span><span class="muted small">${daysText(a.days)}</span></div>
            <label class="al-switch"><input type="checkbox" data-on${a.on ? ' checked' : ''}><span>${a.on ? 'On' : 'Off'}</span></label>
            <div class="al-btns"><button class="pill-btn" type="button" data-edit>Edit</button>
              <button class="pill-btn" type="button" data-del>Delete</button></div>
          </li>`).join('') : (editing === 'new' ? '' : '<li class="muted">No alarms yet.</li>')}
      </ul>`;
  };

  card.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-add]')) { editing = 'new'; draw(); return; }
    if (t.closest('[data-cancel]')) { editing = null; draw(); return; }
    const day = t.closest('[data-day]');
    if (day) {
      const on = !day.classList.contains('active');
      day.classList.toggle('active', on);
      day.setAttribute('aria-pressed', on);
      return;
    }
    const row = t.closest('[data-id]');
    if (!row) return;
    const id = row.dataset.id;
    if (t.closest('[data-edit]')) { editing = id; draw(); }
    if (t.closest('[data-del]') && confirm('Delete this alarm?')) deleteAlarm(id);
  });
  card.addEventListener('change', (e) => {
    const box = e.target.closest('[data-on]');
    if (box) setAlarmOn(box.closest('[data-id]').dataset.id, box.checked);
  });
  card.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    if (!f.elements.time.value) { f.elements.time.focus(); return; }
    const days = [...f.querySelectorAll('[data-day].active')].map((b) => Number(b.dataset.day));
    const id = editing === 'new' ? null : editing;
    editing = null;
    saveAlarm({ id, name: f.elements.name.value, time: f.elements.time.value, days });
  });

  window.addEventListener('sf:alarms', draw);
  window.addEventListener('sf:audio-ready', draw);
  draw();
}
