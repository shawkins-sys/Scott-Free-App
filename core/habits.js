// Habit questions about yesterday, asked in the morning check-in.
// Definitions live in settings.data.habits and are managed in Settings.
// Answers are stored in checkins.habits as { key: index }, where index is the
// position of the chosen answer. Index 0 always means "did not" (None or No),
// so trends can compare days after a habit against days without it.
import { getSettings, updateSettings } from './wellbeing.js';

const CACHE = 'sf-habits';

export const DEFAULT_HABITS = [
  { key: 'alcohol', label: 'Alcohol', options: ['None', '1 to 2 drinks', '3 or more'], active: true },
  { key: 'social', label: 'Social media', options: ['None', 'A bit', 'Too much'], active: true },
  { key: 'caffeine_pm', label: 'Caffeine after 2pm', options: ['No', 'Yes'], active: true },
  { key: 'screens_bed', label: 'Screens in bed', options: ['None', 'Under 30 min', '30 min or more'], active: true },
];

const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE)); } catch { return null; } };

// All habits, including turned-off ones. Falls back to the copy on this
// device (offline) and then to the defaults.
export async function getHabits() {
  try {
    const s = await getSettings();
    const list = Array.isArray(s.habits) ? s.habits : DEFAULT_HABITS;
    try { localStorage.setItem(CACHE, JSON.stringify(list)); } catch { /* ignore */ }
    return list;
  } catch {
    return readCache() || DEFAULT_HABITS;
  }
}

export const activeHabits = (list) => list.filter((h) => h.active !== false);

export async function saveHabits(list) {
  await updateSettings({ habits: list });
  try { localStorage.setItem(CACHE, JSON.stringify(list)); } catch { /* ignore */ }
}

// Stable key for a new habit: never reused, so history stays attached.
export function newHabitKey(label, list) {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24) || 'habit';
  let key = base;
  for (let n = 2; list.some((h) => h.key === key); n += 1) key = `${base}_${n}`;
  return key;
}
