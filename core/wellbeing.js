// Wellbeing data: check-ins, phrases and the daily phrase choice.
// Shared by Home (check-in, hub lock, phrase line) and the Wellbeing hub.
import { supabase, currentUserId } from './supabase.js';
import { todayKey } from './date.js';

// Check-in metrics, all on a 1 to 5 scale and stored in checkins.metrics.
// To add a metric later, add one line here. No database change needed.
export const METRICS = [
  { key: 'mood',             label: 'Mood',             low: 'Low',     high: 'Great' },
  { key: 'sleep',            label: 'Sleep quality',    low: 'Poor',    high: 'Great' },
  { key: 'energy',           label: 'Energy',           low: 'Drained', high: 'Energised' },
  { key: 'emotional_stress', label: 'Emotional stress', low: 'Calm',    high: 'Very high' },
  { key: 'work_stress',      label: 'Work stress',      low: 'Calm',    high: 'Very high' },
  { key: 'physical',         label: 'Physical feeling', low: 'Rough',   high: 'Great' },
];

export const SEED_PHRASE =
  'Anxiety lives in the future. Depression lives in the past. Find the flow in between.';

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Check-ins ----------

// Cached for the current London day so the hub bar can check the lock quickly.
let todayCache = { day: null, entry: undefined };

export async function getTodayCheckin({ refresh = false } = {}) {
  const day = todayKey();
  if (!refresh && todayCache.day === day && todayCache.entry !== undefined) return todayCache.entry;
  const { data, error } = await supabase
    .from('checkins').select('*').eq('day', day).maybeSingle();
  if (error) throw error;
  todayCache = { day, entry: data || null };
  return todayCache.entry;
}

// True once today's check-in exists. Uses the cache only, so call
// getTodayCheckin() first after a fresh load.
export function checkinDoneToday() {
  return todayCache.day === todayKey() && !!todayCache.entry;
}

export async function getLastCheckin() {
  const { data, error } = await supabase
    .from('checkins').select('*').order('day', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveCheckin({ metrics, hours_slept, exercised, note }) {
  const day = todayKey();
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from('checkins')
    .upsert({ user_id, day, metrics, hours_slept, exercised, note: note || null },
            { onConflict: 'user_id,day' })
    .select().single();
  if (error) throw error;
  todayCache = { day, entry: data };
  return data;
}

// Tough day: mood 1 or 2, or emotional or work stress 4 or 5.
export function isToughDay(metrics = {}) {
  return (metrics.mood && metrics.mood <= 2)
    || metrics.emotional_stress >= 4
    || metrics.work_stress >= 4;
}

// ---------- Phrases ----------

export async function listPhrases() {
  const { data, error } = await supabase
    .from('phrases').select('*').order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Adds the seed phrase once, the first time the phrase list is empty.
export async function ensureSeedPhrase(phrases) {
  if (phrases.length) return phrases;
  const settings = await getSettings();
  if (settings.phraseSeeded) return phrases;
  const { data, error } = await supabase
    .from('phrases').insert({ text: SEED_PHRASE }).select().single();
  if (error) throw error;
  await updateSettings({ phraseSeeded: true });
  return [data];
}

export async function addPhrase(text, tough_days = false) {
  const { error } = await supabase.from('phrases').insert({ text, tough_days });
  if (error) throw error;
}

export async function updatePhrase(id, fields) {
  const { error } = await supabase.from('phrases').update(fields).eq('id', id);
  if (error) throw error;
}

export async function deletePhrase(id) {
  const { error } = await supabase.from('phrases').delete().eq('id', id);
  if (error) throw error;
}

// Only one phrase can be pinned at a time. Pinning one unpins the rest.
export async function setPinned(id, pinned) {
  if (pinned) {
    const { error } = await supabase.from('phrases').update({ pinned: false }).eq('pinned', true);
    if (error) throw error;
  }
  await updatePhrase(id, { pinned });
}

// ---------- Settings (settings.data jsonb) ----------

export async function getSettings() {
  const { data, error } = await supabase.from('settings').select('data').maybeSingle();
  if (error) throw error;
  return (data && data.data) || {};
}

// Merges the given keys into settings.data.
export async function updateSettings(patch) {
  const current = await getSettings();
  const user_id = await currentUserId();
  const { error } = await supabase.from('settings').upsert(
    { user_id, data: { ...current, ...patch }, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' });
  if (error) throw error;
}

// ---------- Daily phrase ----------

// Chooses today's phrase once, when the check-in is first saved.
// Order: pinned phrase, then a tough days phrase if today is a tough day,
// then a random normal phrase (not the same as yesterday's where possible).
// The choice is saved in settings so it stays the same all day.
export async function pickDailyPhrase(metrics) {
  const day = todayKey();
  const settings = await getSettings();
  if (settings.dailyPhrase && settings.dailyPhrase.day === day) return;

  const phrases = await ensureSeedPhrase(await listPhrases());
  if (!phrases.length) return;
  const tough = phrases.filter((p) => p.tough_days);
  const normal = phrases.filter((p) => !p.tough_days);
  let pool = isToughDay(metrics) && tough.length ? tough : (normal.length ? normal : phrases);

  const prevId = settings.dailyPhrase && settings.dailyPhrase.id;
  if (pool.length > 1) pool = pool.filter((p) => p.id !== prevId);
  const pick = pool[Math.floor(Math.random() * pool.length)];
  await updateSettings({ dailyPhrase: { day, id: pick.id } });
}

// Text for the line under the greeting, or '' before the check-in is done.
// A pinned phrase always wins once the check-in is done.
export async function getDisplayPhrase() {
  if (!checkinDoneToday()) return '';
  const phrases = await listPhrases();
  const pinned = phrases.find((p) => p.pinned);
  if (pinned) return pinned.text;
  const settings = await getSettings();
  const choice = settings.dailyPhrase;
  if (!choice || choice.day !== todayKey()) return '';
  const p = phrases.find((x) => x.id === choice.id);
  return p ? p.text : '';
}
