// Morning page data (replaces Money, 22/11/2026). One call to the `morning`
// Edge Function returns football, news per topic, one good thing and on this
// day. The last copy is kept on the device, so the page shows at once (and
// offline) while a fresh copy loads; it is refreshed when over 20 minutes old.
// Which sections show: settings.data.morning.show { football, tech, utd, good, otd }.
import { supabase } from './supabase.js';
import { getSettings, updateSettings } from './wellbeing.js';

const KEY = 'sf-morning';
const FRESH_MS = 20 * 60 * 1000;

export const SECTIONS = [
  ['football', 'Premier League and Man Utd'],
  ['tech', 'Tech and AI headlines'],
  ['utd', 'Man Utd headlines'],
  ['good', 'One good thing'],
  ['otd', 'On this day'],
];

export function savedMorning() {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
}

export const isFresh = (saved) => !!saved && Date.now() - saved.at < FRESH_MS;

export async function fetchMorning() {
  const { data, error } = await supabase.functions.invoke('morning', { body: {} });
  if (error || !data || data.result !== 'ok') throw error || new Error('Morning not available');
  const saved = { at: Date.now(), data };
  try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* ignore */ }
  return saved;
}

export function showFrom(saved) {
  const s = (saved && saved.show) || {};
  return Object.fromEntries(SECTIONS.map(([id]) => [id, s[id] !== false]));
}

export async function loadShow() {
  try {
    const s = (await getSettings()).morning || {};
    const show = showFrom(s);
    localStorage.setItem('sf-morning-show', JSON.stringify(show));
    return show;
  } catch {
    try { return showFrom({ show: JSON.parse(localStorage.getItem('sf-morning-show')) }); } catch { return showFrom(null); }
  }
}

export async function saveShow(show) {
  const cur = (await getSettings()).morning || {};
  await updateSettings({ morning: { ...cur, show } });
  try { localStorage.setItem('sf-morning-show', JSON.stringify(show)); } catch { /* ignore */ }
}
