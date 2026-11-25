// Quick notes (Tools page, phase 3; Scott, 25/11/2026). Saved in
// settings.data.notes as [{ id, text, pinned, done, at }] (at = last change,
// ms), with a copy on this device for a fast start. Pinned notes sit at the
// top; ticked notes move to a Done group until cleared.
import { getSettings, updateSettings } from './wellbeing.js';

const KEY = 'sf-notes';
export const MAX_NOTES = 200;
export const MAX_LEN = 500;

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

const clean = (list) => (Array.isArray(list) ? list : [])
  .filter((n) => n && n.id && typeof n.text === 'string' && n.text.trim())
  .map((n) => ({ id: String(n.id), text: n.text.slice(0, MAX_LEN), pinned: !!n.pinned, done: !!n.done, at: Number(n.at) || 0 }))
  .slice(0, MAX_NOTES);

// Pinned first, then newest first; ticked notes last.
export function sorted(list) {
  return clean(list).sort((a, b) => (a.done - b.done) || (b.pinned - a.pinned) || (b.at - a.at));
}

export function cachedNotes() {
  try { return sorted(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { return []; }
}

function keep(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage full */ }
}

export async function listNotes() {
  const list = sorted((await getSettings()).notes);
  keep(list);
  return list;
}

// Reads the latest copy first so a change on another device is not lost.
async function change(fn) {
  const list = sorted(fn(clean((await getSettings()).notes)));
  await updateSettings({ notes: list });
  keep(list);
  return list;
}

const patch = (id, fields) => change((l) => l.map((n) => (n.id === id ? { ...n, ...fields, at: Date.now() } : n)));

export const addNote = (text) => change((l) => [{ id: newId(), text: text.trim().slice(0, MAX_LEN), pinned: false, done: false, at: Date.now() }, ...l]);
export const editNote = (id, text) => patch(id, { text: text.trim().slice(0, MAX_LEN) });
export const togglePin = (id, pinned) => patch(id, { pinned });
export const toggleDone = (id, done) => patch(id, done ? { done, pinned: false } : { done });
export const deleteNote = (id) => change((l) => l.filter((n) => n.id !== id));
export const clearDone = () => change((l) => l.filter((n) => !n.done));

// Tile status: the top pinned note, else the newest, else a prompt.
export function notesStatus(list) {
  const open = list.filter((n) => !n.done);
  if (!open.length) return 'Jot something down';
  const first = open[0].text.replace(/\s+/g, ' ');
  return open[0].pinned ? `Pinned: ${first}` : first;
}
