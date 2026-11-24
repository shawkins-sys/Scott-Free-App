// Background art: one scene per day, the same on every device, never the
// same as yesterday. Each scene has day (light mode) and night (dark mode)
// images, portrait (phone) and landscape (wall display and wide screens). A scene is used once it
// has both phone images; a missing wall image falls back to the phone one.
// Setting settings.data.background: 'rotate' (default) or a scene id.
//
// Any number of scenes: to add one, add an entry to SCENES (unique id, label
// shown in Settings, Background). Scenes without both phone images show as
// "coming soon" and stay out of the rotation.
// To add or replace an image: put it in assets/bg/ named
// <scene>-<phone|wall>-<day|night>.webp, fill in the path below and bump
// that scene's v (so devices fetch the new file instead of the saved one).
import { getSettings, updateSettings } from './wellbeing.js';
import { todayKey } from './date.js';
import { isWall } from './device.js';

export const SCENES = [
  { id: 'beach', label: 'Beach', v: 2,
    phone: { day: 'beach-phone-day.webp', night: 'beach-phone-night.webp' },
    wall: { day: 'beach-wall-day.webp', night: 'beach-wall-night.webp' } },
  { id: 'palms', label: 'Palm trees', v: 1,
    phone: { day: 'palms-phone-day.webp', night: 'palms-phone-night.webp' },
    wall: { day: 'palms-wall-day.webp', night: 'palms-wall-night.webp' } },
  { id: 'coral', label: 'Coral', v: 1,
    phone: { day: 'coral-phone-day.webp', night: 'coral-phone-night.webp' },
    wall: { day: 'coral-wall-day.webp', night: 'coral-wall-night.webp' } },
  { id: 'rainforest', label: 'Rainforest', v: 1,
    phone: { day: 'rainforest-phone-day.webp', night: 'rainforest-phone-night.webp' },
    wall: { day: 'rainforest-wall-day.webp', night: 'rainforest-wall-night.webp' } },
  { id: 'winter', label: 'Winter', v: 1,
    phone: { day: 'winter-phone-day.webp', night: 'winter-phone-night.webp' },
    wall: { day: 'winter-wall-day.webp', night: 'winter-wall-night.webp' } },
  { id: 'mountains', label: 'Misty mountains', v: 1,
    phone: { day: 'mountains-phone-day.webp', night: 'mountains-phone-night.webp' },
    wall: { day: 'mountains-wall-day.webp', night: 'mountains-wall-night.webp' } },
  { id: 'northern', label: 'Northern lights', v: 1,
    phone: { day: 'northern-phone-day.webp', night: 'northern-phone-night.webp' },
    wall: { day: 'northern-wall-day.webp', night: 'northern-wall-night.webp' } },
  { id: 'dunes', label: 'Desert dunes', v: 1,
    phone: { day: 'dunes-phone-day.webp', night: 'dunes-phone-night.webp' },
    wall: { day: 'dunes-wall-day.webp', night: 'dunes-wall-night.webp' } },
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

const isWide = () => window.innerWidth > window.innerHeight;

function apply(pref) {
  const ready = readyScenes();
  const scene = (pref !== 'rotate' && ready.find((s) => s.id === pref)) || sceneForDay(todayKey(), ready);
  if (!scene) return;
  // Landscape images on the wall display and on any wide screen (wider than
  // tall), where the scene has them; portrait images otherwise.
  const set = (isWall() || isWide()) && scene.wall.day && scene.wall.night ? scene.wall : scene.phone;
  const root = document.documentElement.style;
  root.setProperty('--bg-art-day', `url("${url(scene, set.day)}")`);
  root.setProperty('--bg-art-night', `url("${url(scene, set.night)}")`);
  document.documentElement.dataset.bgScene = scene.id;
  matchStatusBar(url(scene, set.day), url(scene, set.night));
}

// Phone status bar: match the colour at the top of the screen (the image's
// top edge under the veil from theme.css), so the bar blends with the art
// instead of showing a pale strip. Worked out once per image and saved.
const VEIL = {
  light: { rgb: [247, 249, 253], a: 0.62 },
  dark: { rgb: [12, 19, 30], a: 0.55 },
};
const BAR_CACHE = 'sf-statusbar';

function topColour(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = 24; c.height = 4;
        const g = c.getContext('2d', { willReadFrequently: true });
        // Top 4% of the image, averaged down to a small strip.
        g.drawImage(img, 0, 0, img.naturalWidth, Math.max(1, img.naturalHeight * 0.04), 0, 0, 24, 4);
        const d = g.getImageData(0, 0, 24, 4).data;
        const sum = [0, 0, 0];
        for (let i = 0; i < d.length; i += 4) { sum[0] += d[i]; sum[1] += d[i + 1]; sum[2] += d[i + 2]; }
        const n = d.length / 4;
        resolve(sum.map((v) => v / n));
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

const hex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const blend = (img, veil) => img.map((v, i) => veil.rgb[i] * veil.a + v * (1 - veil.a));

function setBar(mode, colour) {
  const meta = document.querySelector(`meta[name="theme-color"][media*="${mode}"]`);
  if (meta && colour) meta.setAttribute('content', colour);
}

async function matchStatusBar(daySrc, nightSrc) {
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(BAR_CACHE) || '{}'); } catch { /* ignore */ }
  for (const [mode, src] of [['light', daySrc], ['dark', nightSrc]]) {
    if (cache[src]) { setBar(mode, cache[src]); continue; }
    const rgb = await topColour(src);
    if (!rgb) continue;
    cache[src] = hex(blend(rgb, VEIL[mode]));
    setBar(mode, cache[src]);
  }
  try { localStorage.setItem(BAR_CACHE, JSON.stringify(cache)); } catch { /* ignore */ }
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
  // Switch between portrait and landscape images when the window shape changes.
  let wide = isWide();
  let t = null;
  window.addEventListener('resize', () => {
    clearTimeout(t);
    t = setTimeout(() => { if (isWide() !== wide) { wide = isWide(); apply(readPref()); } }, 250);
  });
}

export const getBackgroundPref = readPref;

// Phone image URLs for a scene (Settings previews). Null if not added yet.
export const sceneImages = (scene) => ({
  day: scene.phone.day ? url(scene, scene.phone.day) : null,
  night: scene.phone.night ? url(scene, scene.phone.night) : null,
});

export async function setBackgroundPref(pref) {
  await updateSettings({ background: pref });
  writePref(pref);
  apply(pref);
}
