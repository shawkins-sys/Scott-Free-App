// Background art: one scene per day, the same on every device, never the
// same as yesterday. Each scene has day (light mode) and night (dark mode)
// images, for the phone and for the wall display. A scene is used once it
// has both phone images; a missing wall image falls back to the phone one.
// Setting settings.data.background: 'rotate' (default) or a scene id.
//
// To add or replace an image: put it in assets/bg/ named
// <scene>-<phone|wall>-<day|night>.webp, fill in the path below and bump
// that scene's v (so devices fetch the new file instead of the saved one).
import { getSettings, updateSettings } from './wellbeing.js';
import { todayKey } from './date.js';
import { isWall } from './device.js';

export const SCENES = [
  { id: 'beach', label: 'Beach', v: 1,
    phone: { day: 'beach-phone-day.webp', night: 'beach-phone-night.webp' }, wall: { day: null, night: null } },
  { id: 'palms', label: 'Palms', v: 1, phone: { day: null, night: null }, wall: { day: null, night: null } },
  { id: 'coral', label: 'Coral', v: 1, phone: { day: null, night: null }, wall: { day: null, night: null } },
  { id: 'leaves', label: 'Leaves', v: 1, phone: { day: null, night: null }, wall: { day: null, night: null } },
];

const PREF_CACHE = 'sf-background';
const ANCHOR = Date.UTC(2026, 10, 1); // 01/11/2026: start of the daily sequence

export const readyScenes = () => SCENES.filter((s) => s.phone.day && s.phone.night);

const dayNumber = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - ANCHOR) / 86400000);
};

// Small stable hash so every device picks the same "random" scene for a day.
const hash = (n) => {
  let x = (n + 0x9e3779b9) | 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
};

// Walks forward from the anchor: each day moves to a different scene, so no
// scene shows two days running.
export function sceneForDay(key = todayKey(), scenes = readyScenes()) {
  if (!scenes.length) return null;
  if (scenes.length === 1) return scenes[0];
  const days = Math.max(0, dayNumber(key));
  let i = hash(0) % scenes.length;
  for (let k = 1; k <= days; k += 1) i = (i + 1 + (hash(k) % (scenes.length - 1))) % scenes.length;
  return scenes[i];
}

const readPref = () => { try { return localStorage.getItem(PREF_CACHE) || 'rotate'; } catch { return 'rotate'; } };
const writePref = (v) => { try { localStorage.setItem(PREF_CACHE, v); } catch { /* ignore */ } };

const url = (scene, file) => `${new URL(`assets/bg/${file}`, document.baseURI).href}?v=${scene.v}`;

function apply(pref) {
  const ready = readyScenes();
  const scene = (pref !== 'rotate' && ready.find((s) => s.id === pref)) || sceneForDay(todayKey(), ready);
  if (!scene) return;
  const set = isWall() && scene.wall.day && scene.wall.night ? scene.wall : scene.phone;
  const root = document.documentElement.style;
  root.setProperty('--bg-art-day', `url("${url(scene, set.day)}")`);
  root.setProperty('--bg-art-night', `url("${url(scene, set.night)}")`);
  document.documentElement.dataset.bgScene = scene.id;
}

// Before sign-in: use this device's saved choice straight away.
export const applySavedBackground = () => apply(readPref());

let started = false;
// After sign-in: checks the account setting, and re-applies when the app
// comes back into view (a new day may mean a new scene).
export function startBackground() {
  apply(readPref());
  if (started) return;
  started = true;
  getSettings().then((s) => {
    const pref = s.background || 'rotate';
    if (pref !== readPref()) { writePref(pref); apply(pref); }
  }).catch(() => { /* offline: keep the saved choice */ });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) apply(readPref()); });
}

export const getBackgroundPref = readPref;

export async function setBackgroundPref(pref) {
  await updateSettings({ background: pref });
  writePref(pref);
  apply(pref);
}
