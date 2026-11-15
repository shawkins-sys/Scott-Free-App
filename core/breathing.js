// Box breathing: in 4, hold 4, out 4, hold 4, four rounds (about a minute).
// A dot traces a square, one side per step. Optional gentle vibration at
// each step change (setting in Settings, on by default). Resolves when
// finished or skipped.
import { getSettings, updateSettings } from './wellbeing.js';

const STEPS = ['Breathe in', 'Hold', 'Breathe out', 'Hold'];
const STEP_MS = 4000;
const ROUNDS = 4;
const SIZE = 220;
const PAD = 14;

// Settings (settings.data.breathing)
export async function getBreathingSettings() {
  const s = await getSettings();
  return { vibrate: true, ...(s.breathing || {}) };
}
export async function saveBreathingSettings(patch) {
  const current = await getBreathingSettings();
  await updateSettings({ breathing: { ...current, ...patch } });
}

// After the check-in: when emotional or work stress is 5.
export const breathingNeeded = (metrics = {}) => metrics.emotional_stress === 5 || metrics.work_stress === 5;

// Corner points of the square, starting bottom left: up, across, down, back.
const L = PAD;
const R = SIZE - PAD;
const CORNERS = [[L, R], [L, L], [R, L], [R, R], [L, R]];

export async function runBreathing() {
  let vibrate = true;
  try { vibrate = (await getBreathingSettings()).vibrate; } catch { /* default on */ }
  const canVibrate = vibrate && 'vibrate' in navigator;

  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'breathe';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Box breathing');
    el.innerHTML = `
      <div class="breathe-inner">
        <p class="breathe-round" aria-live="polite"></p>
        <svg viewBox="0 0 ${SIZE} ${SIZE}" class="breathe-svg" aria-hidden="true">
          <rect x="${L}" y="${L}" width="${R - L}" height="${R - L}" rx="2" class="breathe-track"/>
          <path class="breathe-trace" d="M${CORNERS.map((c) => c.join(' ')).join(' L')}"/>
          <circle r="11" class="breathe-dot"/>
        </svg>
        <p class="breathe-step" aria-live="assertive"></p>
        <p class="breathe-count"></p>
        <button class="pill-btn breathe-skip" type="button">Skip</button>
      </div>`;
    document.body.appendChild(el);
    const roundEl = el.querySelector('.breathe-round');
    const stepEl = el.querySelector('.breathe-step');
    const countEl = el.querySelector('.breathe-count');
    const dot = el.querySelector('.breathe-dot');
    const trace = el.querySelector('.breathe-trace');
    const perimeter = 4 * (R - L);
    trace.style.strokeDasharray = `${perimeter}`;

    let raf = 0;
    let lastStep = -1;
    let done = false;
    const start = performance.now();
    const total = ROUNDS * STEPS.length * STEP_MS;

    const finish = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      el.classList.add('closing');
      setTimeout(() => { el.remove(); resolve(); }, 250);
    };
    el.querySelector('.breathe-skip').addEventListener('click', finish);

    const frame = (now) => {
      const t = Math.max(0, now - start); // the first frame can be stamped just before start
      if (t >= total) { stepEl.textContent = 'Well done'; countEl.textContent = ''; setTimeout(finish, 1200); return; }
      const stepIndex = Math.floor(t / STEP_MS);      // 0 to 15
      const side = stepIndex % 4;
      const within = (t % STEP_MS) / STEP_MS;          // 0 to 1 along this side
      if (stepIndex !== lastStep) {
        lastStep = stepIndex;
        stepEl.textContent = STEPS[side];
        roundEl.textContent = `Round ${Math.floor(stepIndex / 4) + 1} of ${ROUNDS}`;
        if (canVibrate) navigator.vibrate(side === 0 ? [40, 60, 40] : 50);
      }
      countEl.textContent = String(4 - Math.floor(within * 4));
      const [x1, y1] = CORNERS[side];
      const [x2, y2] = CORNERS[side + 1];
      dot.setAttribute('cx', x1 + (x2 - x1) * within);
      dot.setAttribute('cy', y1 + (y2 - y1) * within);
      // The outline fills in as the dot travels round each round.
      trace.style.strokeDashoffset = `${perimeter * (1 - (side + within) / 4)}`;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  });
}
