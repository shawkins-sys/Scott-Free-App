// Morning check-in form. Used on Home (cannot be skipped) and in the
// Wellbeing hub to edit today's entry.
import { METRICS, saveCheckin, getLastCheckin, esc } from './wellbeing.js';

const HOURS_MIN = 0;
const HOURS_MAX = 14;
const HOURS_STEP = 0.5;

// options: { existing, title, submitLabel, onSaved(entry) }
export async function renderCheckinForm(container, options = {}) {
  const existing = options.existing || null;
  const values = { ...(existing ? existing.metrics : {}) };
  let exercised = existing ? existing.exercised : null;
  let hours = existing && existing.hours_slept != null ? Number(existing.hours_slept) : null;

  if (hours == null) {
    // Start from the last entry's hours, or 7.
    try {
      const last = await getLastCheckin();
      hours = last && last.hours_slept != null ? Number(last.hours_slept) : 7;
    } catch { hours = 7; }
  }

  const dots = (m) => [1, 2, 3, 4, 5].map((n) => `
    <button type="button" class="dot dot-${n}${values[m.key] === n ? ' selected' : ''}"
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
      <label class="field">
        <span>One good thing (optional)</span>
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
    form.querySelectorAll('[data-ex]').forEach((b) => {
      const on = String(exercised) === b.dataset.ex;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    const complete = METRICS.every((m) => values[m.key]) && exercised !== null;
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
    if (ex) { exercised = ex.dataset.ex === 'true'; refresh(); }
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
      });
      msg.textContent = '';
      if (options.onSaved) await options.onSaved(entry);
    } catch (err) {
      console.error('Check-in save failed', err);
      msg.classList.add('error');
      msg.textContent = 'Could not save just now. Please try again.';
      submit.disabled = false;
    }
  });

  refresh();
}
