// Trends: series for the charts and plain-English patterns.
// A pattern only shows when at least 14 check-ins sit behind it, and is
// worded neutrally. Pure functions, so they can be tested away from the app.

export const MIN_ENTRIES = 14;
const DAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const weekday = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const val = (e, key) => (key === 'hours' ? (e.hours_slept == null ? null : Number(e.hours_slept)) : (e.metrics || {})[key] ?? null);

// Values per day for the last `days` days ending today (null where no check-in).
export function series(entries, key, days, today) {
  const byDay = new Map(entries.map((e) => [e.day, e]));
  const [y, m, d] = today.split('-').map(Number);
  const labels = [];
  const values = [];
  for (let i = days - 1; i >= 0; i--) {
    const k = new Date(Date.UTC(y, m - 1, d - i)).toISOString().slice(0, 10);
    labels.push(`${k.slice(8, 10)}/${k.slice(5, 7)}`);
    const e = byDay.get(k);
    values.push(e ? val(e, key) : null);
  }
  const present = values.filter((v) => v != null);
  return { labels, values, average: present.length ? Math.round(mean(present) * 10) / 10 : null, count: present.length };
}

// Compares a metric between two groups of check-ins; returns the gap or null.
function compare(entries, key, inGroup, minEach = 5) {
  const a = [];
  const b = [];
  for (const e of entries) {
    const v = val(e, key);
    if (v == null) continue;
    const g = inGroup(e);
    if (g === true) a.push(v); else if (g === false) b.push(v);
  }
  if (a.length + b.length < MIN_ENTRIES || a.length < minEach || b.length < minEach) return null;
  return mean(a) - mean(b);
}

// Up to four short, neutral observations.
export function patterns(entries) {
  if (entries.length < MIN_ENTRIES) return [];
  const out = [];

  // Mood and 7+ hours' sleep.
  const sleepGap = compare(entries, 'mood', (e) => (e.hours_slept == null ? null : Number(e.hours_slept) >= 7));
  if (sleepGap != null && Math.abs(sleepGap) >= 0.3) {
    out.push(`Your mood averages ${sleepGap > 0 ? 'higher' : 'lower'} after 7+ hours' sleep.`);
  }

  // Energy the day after exercise.
  const exGap = compare(entries, 'energy', (e) => (e.exercised == null ? null : !!e.exercised));
  if (exGap != null && Math.abs(exGap) >= 0.3) {
    out.push(`Your energy tends to be ${exGap > 0 ? 'higher' : 'lower'} on days after you exercise.`);
  }

  // Busiest day of the week for work stress, and for emotional stress.
  for (const [key, label] of [['work_stress', 'Work stress'], ['emotional_stress', 'Emotional stress']]) {
    const withVal = entries.filter((e) => val(e, key) != null);
    if (withVal.length < MIN_ENTRIES) continue;
    const overall = mean(withVal.map((e) => val(e, key)));
    let best = null;
    for (let wd = 0; wd < 7; wd++) {
      const vals = withVal.filter((e) => weekday(e.day) === wd).map((e) => val(e, key));
      if (vals.length < 3) continue;
      const diff = mean(vals) - overall;
      if (!best || diff > best.diff) best = { wd, diff };
    }
    if (best && best.diff >= 0.5) out.push(`${label} tends to be higher on ${DAYS[best.wd]}.`);
  }
  return out.slice(0, 4);
}

// Habit patterns: for each habit, compares the day after it (any answer other
// than the first) with days after not doing it. One line per habit, using the
// clearest difference. Needs 14+ check-ins and at least 5 days on each side.
const HABIT_TARGETS = [
  { key: 'mood', name: 'mood', min: 0.3 },
  { key: 'sleep', name: 'sleep quality', min: 0.3 },
  { key: 'energy', name: 'energy', min: 0.3 },
  { key: 'hours', name: 'hours', min: 0.5 },
];

export function habitPatterns(entries, habits = []) {
  if (entries.length < MIN_ENTRIES) return [];
  const out = [];
  for (const h of habits) {
    const did = (e) => {
      const v = (e.habits || {})[h.key];
      return Number.isInteger(v) ? v > 0 : null;
    };
    let best = null;
    for (const t of HABIT_TARGETS) {
      const gap = compare(entries, t.key, did);
      if (gap == null || Math.abs(gap) < t.min) continue;
      const strength = Math.abs(gap) / t.min;
      if (!best || strength > best.strength) best = { t, gap, strength };
    }
    if (!best) continue;
    const after = `after days with ${h.label.toLowerCase()}`;
    const dir = best.gap > 0 ? 'higher' : 'lower';
    out.push(best.t.key === 'hours'
      ? `You tend to sleep about ${Math.abs(best.gap).toFixed(1)} hours ${best.gap > 0 ? 'more' : 'less'} ${after}.`
      : `Your ${best.t.name} tends to be ${dir} ${after}.`);
  }
  return out;
}
