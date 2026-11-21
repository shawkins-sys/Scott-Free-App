// Morning check-in form. Used on Home (cannot be skipped) and in the
// Wellbeing hub to edit today's entry.
import { METRICS, saveCheckin, getLastCheckin, esc, levelOf } from './wellbeing.js';
import { getHabits, activeHabits } from './habits.js';

const HOURS_MIN = 0;
const HOURS_MAX = 14;
const HOURS_STEP = 0.5;
// Hours outside this range show in red (best sleep is around 7.5 hours).
export const SLEEP_OK_MIN = 7;
export const SLEEP_OK_MAX = 8;
// Two-answer habits show Yes first, like Exercise. Index 0 still means "did not".
const habitOrder = (h) => (h.options.length === 2 ? [1, 0] : h.options.map((_, i) => i));

export const sleepOutOfRange = (h) => h < SLEEP_OK_MIN || h > SLEEP_OK_MAX;

// options: { existing, title, submitLabel, onSaved(entry) }
export async function renderCheckinForm(container, options = {}) {
  const existing = options.existing || null;
  const values = { ...(existing ? existing.metrics : {}) };
  let exercised = existing ? existing.exercised : null;
  let hours = existing && existing.hours_slept != null ? Number(existing.hours_slept) : null;
  const habits = activeHabits(await getHabits());
  const habitVals = { ...((existing && existing.habits) || {}) };

  if (hours == null) {
    // Start from the last entry's hours, or 7.
    try {
      const last = await getLastCheckin();
      hours = last && last.hours_slept != null ? Number(last.hours_slept) : 7;
    } catch { hours = 7; }
  }

  const dots = (m) => [1, 2, 3, 4, 5].map((n) => `
    <button type="button" class="dot dot-${levelOf(m.key, n)}${values[m.key] === n ? ' selected' : ''}"
      data-metric="${m.key}" data-value="${n}" title="${n} of 5"
      aria-label="${m.label} ${n} of 5" aria-pressed="${values[m.key] === n}">
      <span>${n}</span>
    </button>`).join('');

  container.innerHTML = `
    <form class="card checkin" novalidate>
      ${options.title ? `<h2 class="checkin-title">${esc(options.title)}</h2>` : ''}
      ${METRICS.map((m) => `
        <div class="metric" role="group" aria-label="${m.label}">
          <div class="metric-label">${m.label}</div>
          <div class="dots">${dots(m)}</div>
          <div class="metric-ends"><span>${m.low}</span><span>${m.high}</span></div>
        </div>`).join('')}
      <div class="checkin-row">
        <div class="metric-label">Hours slept</div>
        <div class="stepper">
          <button type="button" class="icon-btn" data-hours="-1" aria-label="Fewer hours">-</button>
          <output class="hours-out" aria-live="polite"></output>
          <button type="button" class="icon-btn" data-hours="1" aria-label="More hours">+</button>
        </div>
      </div>
      <div class="checkin-row">
        <div class="metric-label">Exercise yesterday</div>
        <div class="yesno">
          <button type="button" class="pill-btn" data-ex="true">Yes</button>
          <button type="button" class="pill-btn" data-ex="false">No</button>
        </div>
      </div>
      ${habits.length ? `<div class="habits-head metric-label">Yesterday</div>
      ${habits.map((h) => `
        <div class="habit-row" role="group" aria-label="${esc(h.label)} yesterday">
          <div class="habit-label">${esc(h.label)}</div>
          <div class="yesno habit-opts">${habitOrder(h).map((i) => `
            <button type="button" class="pill-btn" data-habit="${esc(h.key)}" data-hv="${i}">${esc(h.options[i])}</button>`).join('')}
          </div>
        </div>`).join('')}` : ''}
      <label class="field">
        <span>One good thing that happened yesterday (optional)</span>
        <input type="text" name="note" maxlength="140" autocomplete="off" value="${esc(existing ? existing.note : '')}">
      </label>
      <p class="form-msg" aria-live="polite"></p>
      <button type="submit" class="primary-btn" disabled>${esc(options.submitLabel || 'Done')}</button>
    </form>`;

  const form = container.querySelector('form');
  const submit = form.querySelector('[type=submit]');
  const msg = form.querySelector('.form-msg');
  const hoursOut = form.querySelector('.hours-out');

  const refresh = () => {
    hoursOut.textContent = `${hours % 1 ? hours.toFixed(1) : hours} h`;
    hoursOut.classList.toggle('sleep-warn', sleepOutOfRange(hours));
    form.querySelectorAll('[data-ex]').forEach((b) => {
      const on = String(exercised) === b.dataset.ex;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    form.querySelectorAll('[data-habit]').forEach((b) => {
      const on = habitVals[b.dataset.habit] === Number(b.dataset.hv);
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    const complete = METRICS.every((m) => values[m.key]) && exercised !== null
      && habits.every((h) => Number.isInteger(habitVals[h.key]));
    submit.disabled = !complete;
  };

  form.addEventListener('click', (e) => {
    const dot = e.target.closest('.dot');
    if (dot) {
      values[dot.dataset.metric] = Number(dot.dataset.value);
      dot.parentElement.querySelectorAll('.dot').forEach((d) => {
        const on = d === dot;
        d.classList.toggle('selected', on);
        d.setAttribute('aria-pressed', String(on));
      });
      refresh();
      return;
    }
    const step = e.target.closest('[data-hours]');
    if (step) {
      hours = Math.min(HOURS_MAX, Math.max(HOURS_MIN, hours + Number(step.dataset.hours) * HOURS_STEP));
      refresh();
      return;
    }
    const ex = e.target.closest('[data-ex]');
    if (ex) { exercised = ex.dataset.ex === 'true'; refresh(); return; }
    const hb = e.target.closest('[data-habit]');
    if (hb) { habitVals[hb.dataset.habit] = Number(hb.dataset.hv); refresh(); }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submit.disabled) return;
    submit.disabled = true;
    msg.classList.remove('error');
    msg.textContent = 'Saving...';
    try {
      const entry = await saveCheckin({
        metrics: { ...values },
        hours_slept: hours,
        exercised,
        note: form.note.value.trim(),
        habits: { ...habitVals },
      });
      msg.textContent = '';
      if (options.onSaved) await options.onSaved(entry);
    } catch (err) {
      console.error('Check-in save failed', err);
      msg.classList.add('error');
      msg.textContent = navigator.onLine ? 'Could not save just now. Please try again.' : 'You are offline. Your answers are still here: tap Done again once you are back online.';
      submit.disabled = false;
    }
  });

  refresh();
}
