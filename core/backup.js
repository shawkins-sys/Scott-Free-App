// Backup and export (Settings, Device and security).
// 1. Full backup: one JSON file with everything needed to restore the account.
// 2. Wellbeing spreadsheet: one CSV row per day (ratings, sleep, exercise,
//    habits, note).
// 3. Weekly reviews spreadsheet: one CSV row per week (averages, reflection).
// Money data is left out on purpose (Scott, 21/11/2026: the Money section is
// being rethought). Spotify tokens never leave the server; photos come from
// Google Photos and can be chosen again.
import { supabase } from './supabase.js';
import { METRICS } from './wellbeing.js';
import { getHabits } from './habits.js';
import { todayKey } from './date.js';

export const BACKUP_FORMAT = 1;

// Tables in the full backup, in restore order (lists before their items).
export const BACKUP_TABLES = [
  'settings', 'layouts', 'checkins', 'phrases', 'weekly_reviews', 'key_dates',
  'playlists', 'shopping_lists', 'shopping_items', 'shopping_staples',
];

// Money settings kept out of the backup.
const MONEY_SETTING_KEYS = ['money', 'pay', 'categoriesSeeded'];

async function readTable(table) {
  const { data, error } = await supabase.from(table).select('*');
  if (error) {
    // A table that does not exist yet (SQL not run) is skipped, not fatal.
    if (/does not exist|schema cache/i.test(error.message || '')) return [];
    throw error;
  }
  return data || [];
}

const strip = (row) => {
  const { user_id, ...rest } = row; // eslint-disable-line no-unused-vars
  return rest;
};

export async function buildBackup() {
  const tables = {};
  for (const t of BACKUP_TABLES) tables[t] = (await readTable(t)).map(strip);
  // Remove money settings and money figures from weekly reviews.
  for (const s of tables.settings) {
    if (s.data) for (const k of MONEY_SETTING_KEYS) delete s.data[k];
  }
  for (const r of tables.weekly_reviews) {
    if (r.snapshot) delete r.snapshot.money;
  }
  return { app: 'Scott Hub', format: BACKUP_FORMAT, exportedAt: new Date().toISOString(), tables };
}

// ---------- CSV ----------

const cell = (v) => {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows) => rows.map((r) => r.map(cell).join(',')).join('\r\n');
const ukDate = (key) => { const [y, m, d] = String(key).slice(0, 10).split('-'); return `${d}/${m}/${y}`; };

export async function wellbeingCsv(checkins) {
  const habits = await getHabits(); // includes turned-off habits, so old answers keep their column
  const head = ['Date', ...METRICS.map((m) => `${m.label} (1 to 5)`), 'Hours slept', 'Exercised yesterday',
    ...habits.map((h) => h.label), 'One good thing'];
  const rows = [...checkins].sort((a, b) => (a.day < b.day ? -1 : 1)).map((c) => [
    ukDate(c.day),
    ...METRICS.map((m) => (c.metrics || {})[m.key] ?? ''),
    c.hours_slept ?? '',
    c.exercised == null ? '' : (c.exercised ? 'Yes' : 'No'),
    ...habits.map((h) => { const i = (c.habits || {})[h.key]; return i == null ? '' : (h.options[i] ?? i); }),
    c.note || '',
  ]);
  return toCsv([head, ...rows]);
}

export function weeklyCsv(reviews) {
  const head = ['Week starting', 'Check-ins', ...METRICS.map((m) => `Average ${m.label.toLowerCase()}`),
    'Average hours slept', 'Reviewed', 'Reflection'];
  const rows = [...reviews].sort((a, b) => (a.week_start < b.week_start ? -1 : 1)).map((r) => {
    const avg = (r.snapshot && r.snapshot.checkins && r.snapshot.checkins.this) || {};
    return [ukDate(r.week_start), avg.count ?? '', ...METRICS.map((m) => avg[m.key] ?? ''), avg.hours ?? '',
      r.reviewed ? 'Yes' : 'No', r.reflection || ''];
  });
  return toCsv([head, ...rows]);
}

// ---------- Download ----------

export function download(filename, text, type) {
  // A byte order mark helps Excel read UK characters (like £) in CSV files.
  const blob = new Blob([type === 'text/csv' ? '﻿' : '', text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export const fileStamp = () => todayKey(); // YYYY-MM-DD sorts correctly in a folder
