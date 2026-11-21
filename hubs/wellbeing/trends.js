// Wellbeing hub Trends card: one chart, pick the metric, 7 or 30 days,
// plus plain-English patterns once 14+ check-ins exist.
import { METRICS, listCheckins, esc } from '../../core/wellbeing.js';
import { getHabits } from '../../core/habits.js';
import { series, patterns, habitPatterns, MIN_ENTRIES } from '../../core/trends.js';
import { todayKey } from '../../core/date.js';

const CHART_JS = 'https://cdn.jsdelivr.net/npm/chart.js@4.6.1/auto/+esm';
const CHOICES = [...METRICS.map((m) => ({ key: m.key, label: m.label })), { key: 'hours', label: 'Hours slept' }];
const view = { key: 'mood', days: 7 };
let chart = null;

const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const addDays = (k, n) => { const [y, m, d] = k.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

export async function renderTrends(card) {
  card.innerHTML = '<h2 class="card-title">Trends</h2><p class="muted small">Loading...</p>';
  const today = todayKey();
  let entries;
  const habits = await getHabits();
  try { entries = await listCheckins(addDays(today, -365), addDays(today, 1)); } catch (err) {
    console.error(err);
    card.innerHTML = '<h2 class="card-title">Trends</h2><p class="muted small">Trends are not available right now.</p>';
    return;
  }

  const draw = async () => {
    const s = series(entries, view.key, view.days, today);
    const choice = CHOICES.find((c) => c.key === view.key);
    const found = patterns(entries);
    const habitFound = habitPatterns(entries, habits);
    card.innerHTML = `
      <h2 class="card-title">Trends</h2>
      <div class="chips">${CHOICES.map((c) => `<button class="chip${c.key === view.key ? ' active' : ''}" data-key="${c.key}">${c.label}</button>`).join('')}</div>
      <div class="seg">
        <button class="seg-btn${view.days === 7 ? ' active' : ''}" data-days="7">7 days</button>
        <button class="seg-btn${view.days === 30 ? ' active' : ''}" data-days="30">30 days</button>
      </div>
      <div class="chart-wrap trend-wrap"><canvas aria-label="${choice.label}, last ${view.days} days"></canvas></div>
      <p class="muted small">${s.average != null ? `${choice.label} averaged <strong>${view.key === 'hours' ? `${s.average} h` : s.average}</strong> over ${s.count} check-in${s.count === 1 ? '' : 's'}.` : 'No check-ins in this period.'}</p>
      <h3 class="w-head">Patterns</h3>
      ${found.length ? `<ul class="pattern-list">${found.map((p) => `<li>${p}</li>`).join('')}</ul>`
        : `<p class="muted small">${entries.length < MIN_ENTRIES ? `Patterns appear after ${MIN_ENTRIES} check-ins (${entries.length} so far).` : 'No clear patterns yet.'}</p>`}
      <h3 class="w-head">Habits</h3>
      ${habitFound.length ? `<ul class="pattern-list">${habitFound.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`
        : `<p class="muted small">Habit patterns appear once there are ${MIN_ENTRIES} check-ins, with at least 5 days with and 5 without each habit.</p>`}`;

    if (chart) { chart.destroy(); chart = null; }
    const canvas = card.querySelector('canvas');
    try {
      const { Chart } = await import(CHART_JS);
      if (!canvas.isConnected) return;
      const accent = cssVar('--accent') || '#3f7fd9';
      const text = cssVar('--muted') || '#667';
      const grid = cssVar('--border') || '#ddd';
      chart = new Chart(canvas, {
        type: 'line',
        data: { labels: s.labels, datasets: [{ data: s.values, borderColor: accent, backgroundColor: accent, pointRadius: view.days === 7 ? 4 : 2.5, tension: 0.3, spanGaps: true }] },
        options: {
          maintainAspectRatio: false,
          animation: false,
          plugins: { legend: { display: false } },
          scales: {
            y: view.key === 'hours'
              ? { suggestedMin: 4, suggestedMax: 10, ticks: { color: text }, grid: { color: grid } }
              : { min: 1, max: 5, ticks: { stepSize: 1, color: text }, grid: { color: grid } },
            x: { ticks: { color: text, maxRotation: 0, autoSkip: true, maxTicksLimit: view.days === 7 ? 7 : 6 }, grid: { display: false } },
          },
        },
      });
    } catch (err) {
      console.warn('Chart did not load', err);
      canvas.parentElement.innerHTML = '<p class="muted small">The chart could not load. Check your connection.</p>';
    }
  };

  card.onclick = (e) => {
    const k = e.target.closest('[data-key]');
    const d = e.target.closest('[data-days]');
    if (k) { view.key = k.dataset.key; draw(); }
    if (d) { view.days = Number(d.dataset.days); draw(); }
  };
  await draw();
}
