// Photo framing: a saved focus point per slideshow photo, so the photo card
// crops around the important part (a face, or a point Scott picks in Settings).
// Stored in settings.data.photoFocus = { "<file name>": { x, y, m } }
// x and y are 0..1 across and down the photo; m is true for a manual choice
// (manual always beats automatic). A copy is kept on the device for a fast start.
import { getSettings, updateSettings } from './wellbeing.js';

const LOCAL_KEY = 'sf-photo-focus';
// No focus saved yet: tall photos crop a little above the middle (faces tend to be high).
export const DEFAULT_FOCUS = { x: 0.5, y: 0.38 };

let focus = readLocal();
let pending = {};      // changes waiting to be saved
let removed = new Set(); // manual points reset to automatic
let saveTimer = null;

function readLocal() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) || {}; } catch { return {}; }
}
function writeLocal() {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(focus)); } catch { /* ignore */ }
}

export function getFocus(name) { return focus[name] || null; }
export function allFocus() { return { ...focus }; }

// Takes the saved points from settings (called when settings are read).
export function applyFocusFromSettings(saved) {
  if (!saved || typeof saved !== 'object') return;
  focus = { ...saved, ...pending };
  for (const n of removed) delete focus[n];
  writeLocal();
}

// Saves a point. Automatic points never replace a manual one.
export function setFocus(name, x, y, manual = false) {
  const cur = focus[name];
  if (!manual && cur && cur.m) return;
  const p = { x: round(x), y: round(y) };
  if (manual) p.m = true;
  focus[name] = p;
  pending[name] = p;
  if (manual) removed.delete(name); // an automatic point after a reset keeps the reset
  writeLocal();
  queueSave(manual ? 300 : 8000);
}

// Removes a manual point so the automatic framing is used again.
export function resetFocus(name) {
  delete focus[name];
  delete pending[name];
  removed.add(name);
  writeLocal();
  queueSave(300);
}

const round = (v) => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;

// Automatic points are batched so a run of new photos is one save, not many.
function queueSave(ms) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, ms);
}
async function save() {
  const add = pending; const drop = removed;
  pending = {}; removed = new Set();
  try {
    const current = (await getSettings()).photoFocus || {};
    const next = { ...current };
    for (const n of drop) delete next[n];
    for (const [n, p] of Object.entries(add)) {
      // Another device's manual point is kept, unless it was reset here.
      if (!p.m && next[n] && next[n].m) continue;
      next[n] = p;
    }
    await updateSettings({ photoFocus: next });
  } catch (err) {
    console.warn('Photo framing not saved', err);
    pending = { ...add, ...pending };
    for (const n of drop) removed.add(n);
  }
}

// CSS object-position that puts the focus point as near the middle of the box
// as the photo allows, for an image shown with object-fit: cover.
export function positionFor(point, imgW, imgH, boxW, boxH) {
  const f = point || DEFAULT_FOCUS;
  if (!imgW || !imgH || !boxW || !boxH) return `${f.x * 100}% ${f.y * 100}%`;
  const s = Math.max(boxW / imgW, boxH / imgH);
  const w = imgW * s; const h = imgH * s;
  const px = w - boxW > 1 ? clampPct((f.x * w - boxW / 2) / (w - boxW)) : 50;
  const py = h - boxH > 1 ? clampPct((f.y * h - boxH / 2) / (h - boxH)) : 50;
  return `${px}% ${py}%`;
}
const clampPct = (v) => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 10;
