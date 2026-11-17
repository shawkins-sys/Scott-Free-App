// Shopping list data with offline support.
// A copy of the lists, items and staples is kept on the device. Every change
// is applied locally first, then queued in an outbox and sent to Supabase.
// The outbox is retried when the device is back online or the page is shown
// again. If two devices change the same row, the latest change wins.
import { supabase, currentUserId } from './supabase.js';

const CACHE_KEY = 'sf-shop-cache';
const OUTBOX_KEY = 'sf-shop-outbox';
const MAX_TRIES = 5;

const COLS = {
  shopping_lists: ['id', 'name', 'sort', 'created_at', 'updated_at'],
  shopping_items: ['id', 'list_id', 'name', 'qty', 'notes', 'done', 'done_at', 'created_at', 'updated_at'],
  shopping_staples: ['id', 'list_id', 'name', 'qty', 'created_at'],
};
const KEY = { shopping_lists: 'lists', shopping_items: 'items', shopping_staples: 'staples' };

const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full */ } };

let state = read(CACHE_KEY, { uid: null, lists: [], items: [], staples: [] });
let outbox = read(OUTBOX_KEY, []);
let flushing = null;
const listeners = new Set();

const now = () => new Date().toISOString();
const newId = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  }));
const pick = (table, row) => Object.fromEntries(COLS[table].map((c) => [c, row[c] ?? null]));

function save() { write(CACHE_KEY, state); write(OUTBOX_KEY, outbox); }
function emit() { listeners.forEach((fn) => { try { fn(state); } catch (e) { console.error(e); } }); }
function changed() { save(); emit(); flush(); }

export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const getState = () => state;
export const pendingCount = () => outbox.length;

// ---------- Outbox ----------

function queueUpsert(table, row) {
  const op = { op: 'upsert', table, id: row.id, row: pick(table, row), tries: 0 };
  const i = outbox.findIndex((o) => o.op === 'upsert' && o.table === table && o.id === row.id);
  if (i >= 0) outbox[i] = op; else outbox.push(op);
}
function queueDelete(table, id) {
  outbox = outbox.filter((o) => !(o.table === table && o.id === id));
  // Always send the delete: the row may have reached the server already.
  outbox.push({ op: 'delete', table, id, tries: 0 });
}

const isNetworkError = (err) => !navigator.onLine || !err || !err.code
  || /fetch|network|load failed/i.test(err.message || '');

export function flush() {
  if (!supabase || !navigator.onLine) return Promise.resolve();
  if (flushing) return flushing;
  flushing = (async () => {
    while (outbox.length) {
      const o = outbox[0];
      let error;
      try {
        ({ error } = o.op === 'upsert'
          ? await supabase.from(o.table).upsert(o.row, { onConflict: 'id' })
          : await supabase.from(o.table).delete().eq('id', o.id));
      } catch (e) { error = e; }
      if (!error) { outbox.shift(); save(); continue; }
      if (isNetworkError(error)) break;
      // A server-side refusal. Retry a few times, then drop it so one bad
      // change cannot block the rest of the queue.
      o.tries = (o.tries || 0) + 1;
      console.error('Shopping sync failed', o, error);
      if (o.tries >= MAX_TRIES) outbox.shift();
      save();
      break;
    }
  })().finally(() => { flushing = null; emit(); });
  return flushing;
}

// Pull the latest from Supabase. Only replaces the local copy once every
// queued change has been sent, so offline edits are never lost.
export async function refresh() {
  if (!supabase) return state;
  const uid = await currentUserId();
  if (uid && state.uid && state.uid !== uid) {
    state = { uid, lists: [], items: [], staples: [] };
    outbox = [];
  }
  await flush();
  if (outbox.length || !navigator.onLine) return state;
  try {
    const [l, i, s] = await Promise.all([
      supabase.from('shopping_lists').select(COLS.shopping_lists.join(',')).order('sort').order('created_at'),
      supabase.from('shopping_items').select(COLS.shopping_items.join(',')).order('created_at'),
      supabase.from('shopping_staples').select(COLS.shopping_staples.join(',')).order('name'),
    ]);
    const err = l.error || i.error || s.error;
    if (err) throw err;
    if (outbox.length) return state; // a change was made while loading
    state = { uid, lists: l.data || [], items: i.data || [], staples: s.data || [] };
    save();
    emit();
  } catch (e) {
    console.error('Shopping refresh failed', e);
  }
  return state;
}

// Keep in step with other devices (useful on the wall display).
let autoStarted = false;
export function startAutoSync() {
  if (autoStarted) return;
  autoStarted = true;
  window.addEventListener('online', () => refresh());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
}

// ---------- Lists ----------

export const listsSorted = () => [...state.lists].sort((a, b) => (a.sort - b.sort) || a.created_at.localeCompare(b.created_at));

export function addList(name) {
  const t = now();
  const sort = state.lists.reduce((m, l) => Math.max(m, l.sort || 0), 0) + 1;
  const row = { id: newId(), name: name.trim(), sort, created_at: t, updated_at: t };
  state.lists.push(row);
  queueUpsert('shopping_lists', row);
  changed();
  return row;
}
export function renameList(id, name) {
  const row = state.lists.find((l) => l.id === id);
  if (!row) return;
  Object.assign(row, { name: name.trim(), updated_at: now() });
  queueUpsert('shopping_lists', row);
  changed();
}
export function deleteList(id) {
  // Items and staples are removed on the server by the cascade.
  const gone = new Set([...state.items, ...state.staples].filter((r) => r.list_id === id).map((r) => r.id));
  outbox = outbox.filter((o) => !gone.has(o.id));
  state.items = state.items.filter((r) => r.list_id !== id);
  state.staples = state.staples.filter((r) => r.list_id !== id);
  state.lists = state.lists.filter((l) => l.id !== id);
  queueDelete('shopping_lists', id);
  changed();
}

// ---------- Items ----------

const clean = (v) => (v == null ? null : String(v).trim() || null);
const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

// Not done first (oldest first), then done (most recently ticked first).
export function itemsFor(listId) {
  const rows = state.items.filter((r) => r.list_id === listId);
  return {
    todo: rows.filter((r) => !r.done).sort((a, b) => a.created_at.localeCompare(b.created_at)),
    done: rows.filter((r) => r.done).sort((a, b) => (b.done_at || '').localeCompare(a.done_at || '')),
  };
}

export function addItem(listId, { name, qty, notes }) {
  const t = now();
  const row = { id: newId(), list_id: listId, name: name.trim(), qty: clean(qty), notes: clean(notes),
    done: false, done_at: null, created_at: t, updated_at: t };
  state.items.push(row);
  queueUpsert('shopping_items', row);
  changed();
  return row;
}
export function updateItem(id, fields) {
  const row = state.items.find((r) => r.id === id);
  if (!row) return;
  if ('name' in fields) row.name = fields.name.trim();
  if ('qty' in fields) row.qty = clean(fields.qty);
  if ('notes' in fields) row.notes = clean(fields.notes);
  row.updated_at = now();
  queueUpsert('shopping_items', row);
  changed();
}
export function toggleItem(id) {
  const row = state.items.find((r) => r.id === id);
  if (!row) return;
  const t = now();
  Object.assign(row, { done: !row.done, done_at: row.done ? null : t, updated_at: t });
  queueUpsert('shopping_items', row);
  changed();
}
export function deleteItem(id) {
  state.items = state.items.filter((r) => r.id !== id);
  queueDelete('shopping_items', id);
  changed();
}
export function clearDone(listId) {
  const done = state.items.filter((r) => r.list_id === listId && r.done);
  done.forEach((r) => queueDelete('shopping_items', r.id));
  state.items = state.items.filter((r) => !(r.list_id === listId && r.done));
  changed();
  return done.length;
}

// ---------- Staples ----------

export const staplesFor = (listId) => state.staples
  .filter((r) => r.list_id === listId)
  .sort((a, b) => a.name.localeCompare(b.name));

export const isStaple = (listId, name) => state.staples.some((s) => s.list_id === listId && sameName(s.name, name));

export function addStaple(listId, { name, qty }) {
  if (isStaple(listId, name)) return null;
  const row = { id: newId(), list_id: listId, name: name.trim(), qty: clean(qty), created_at: now() };
  state.staples.push(row);
  queueUpsert('shopping_staples', row);
  changed();
  return row;
}
export function deleteStaple(id) {
  state.staples = state.staples.filter((r) => r.id !== id);
  queueDelete('shopping_staples', id);
  changed();
}

// Adds a staple to the list. If it is already on the list and not ticked,
// nothing is added. If it is ticked, it is unticked instead of duplicated.
export function addFromStaple(stapleId) {
  const s = state.staples.find((r) => r.id === stapleId);
  if (!s) return 'missing';
  const existing = state.items.find((r) => r.list_id === s.list_id && sameName(r.name, s.name));
  if (existing && !existing.done) return 'already';
  if (existing) { toggleItem(existing.id); return 'unticked'; }
  addItem(s.list_id, { name: s.name, qty: s.qty, notes: null });
  return 'added';
}
