// Photos tile. Shuffled slideshow from the private `photos` bucket
// (filled from Google Photos via Settings, or uploaded in Supabase).
// Speed and transition per device type (phone or wall) from Settings,
// swipe to skip, tap for full screen, pause button.
// Each photo is saved to Cache Storage the first time it is shown, so it
// is only downloaded once. Shown after the morning check-in.
import { supabase } from '../../core/supabase.js';
import { getTodayCheckin, checkinDoneToday, getSettings } from '../../core/wellbeing.js';
import { openOverlay } from '../../core/overlay.js';
import { isWall } from '../../core/device.js';
import { getFocus, setFocus, positionFor, applyFocusFromSettings, DEFAULT_FOCUS } from '../../core/photo-focus.js';

const BUCKET = 'photos';
const CACHE_NAME = 'sf-photos'; // kept across app updates (see sw.js)
const FADE_S = 1.2; // matches the CSS transition
const CFG_KEY = 'sf-slideshow';
const CFG_REFRESH_MS = 5 * 60 * 1000;

// Slideshow settings: settings.data.slideshow = { phone: {...}, wall: {...} }.
// Computers use the phone settings.
export const SPEEDS = [5, 8, 10, 15, 20, 30];
export const EFFECTS = [['fade', 'Fade'], ['zoom', 'Slow zoom'], ['none', 'None']];
export const SLIDESHOW_DEFAULTS = { phone: { secs: 8, effect: 'fade' }, wall: { secs: 20, effect: 'zoom' } };

export function slideshowFrom(saved) {
  const out = {};
  for (const kind of ['phone', 'wall']) {
    const s = (saved && saved[kind]) || {};
    out[kind] = {
      secs: SPEEDS.includes(s.secs) ? s.secs : SLIDESHOW_DEFAULTS[kind].secs,
      effect: EFFECTS.some(([id]) => id === s.effect) ? s.effect : SLIDESHOW_DEFAULTS[kind].effect,
    };
  }
  return out;
}

function readLocalCfg() {
  try { return slideshowFrom(JSON.parse(localStorage.getItem(CFG_KEY))); } catch { return slideshowFrom(null); }
}

// Called by Settings after a change, and by the refresh below.
export function applySlideshow(all) {
  const clean = slideshowFrom(all);
  try { localStorage.setItem(CFG_KEY, JSON.stringify(clean)); } catch { /* ignore */ }
  state.cfg = clean[isWall() ? 'wall' : 'phone'];
  state.cfgAt = Date.now();
  liveViews().forEach(styleView);
  schedule();
}

// Picks up changes made on another device (for example the phone, for the wall).
function refreshCfg() {
  if (Date.now() - state.cfgAt < CFG_REFRESH_MS) return;
  state.cfgAt = Date.now();
  getSettings().then((d) => { applyFocusFromSettings(d.photoFocus); applySlideshow(d.slideshow); }).catch(() => {});
}
const SIGNED_URL_SECONDS = 3600;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif)$/i; // HEIC is not supported by Chrome

const PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="5" width="3.5" height="14" rx="1"/><rect x="13.5" y="5" width="3.5" height="14" rx="1"/></svg>';
const PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.9l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5z"/></svg>';

// One shared slideshow, so the tile and full screen view stay in step.
const state = { photos: [], index: 0, paused: false, views: new Set(), timer: null, urls: new Map(), cfg: null, cfgAt: 0 };
state.cfg = readLocalCfg()[isWall() ? 'wall' : 'phone'];
let listPromise = null;

const openCache = () => ('caches' in window ? caches.open(CACHE_NAME) : Promise.resolve(null));
const keyFor = (name, version) =>
  new URL(`./__photos/${encodeURIComponent(name)}?v=${encodeURIComponent(version)}`, document.baseURI).href;
const nameFromKey = (key) => decodeURIComponent(new URL(key).pathname.split('/').pop());

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Refreshes the file list once per app load. Removes cached copies of photos
// that have been deleted or replaced. Offline, falls back to the cached photos.
async function loadList() {
  const cache = await openCache();
  let files;
  try {
    const { data, error } = await supabase.storage.from(BUCKET).list('', { limit: 500 });
    if (error) throw error;
    files = (data || [])
      .filter((f) => f.id && IMAGE_EXT.test(f.name))
      .map((f) => ({ name: f.name, key: keyFor(f.name, (f.metadata && f.metadata.eTag) || f.updated_at || '') }));
    if (cache) {
      const keep = new Set(files.map((f) => f.key));
      for (const req of await cache.keys()) if (!keep.has(req.url)) cache.delete(req);
    }
  } catch (err) {
    const reqs = cache ? await cache.keys() : [];
    if (!reqs.length) throw err;
    files = reqs.map((r) => ({ name: nameFromKey(r.url), key: r.url }));
  }
  return shuffle(files);
}

// Returns an object URL for a photo, from the cache or downloaded once.
function photoUrl(photo) {
  if (state.urls.has(photo.key)) return state.urls.get(photo.key);
  const p = (async () => {
    const cache = await openCache();
    let res = cache && (await cache.match(photo.key));
    if (!res) {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(photo.name, SIGNED_URL_SECONDS);
      if (error) throw error;
      res = await fetch(data.signedUrl);
      if (!res.ok) throw new Error(`Photo download failed (${res.status})`);
      if (cache) await cache.put(photo.key, res.clone());
    }
    return URL.createObjectURL(await res.blob());
  })();
  state.urls.set(photo.key, p);
  p.catch(() => state.urls.delete(photo.key));
  return p;
}

// For Settings (Photo framing): the photo list, and a photo as an object URL
// the caller owns (revoke it when done). Uses the same once-only cache.
export async function listPhotos() {
  listPromise = listPromise || loadList();
  try { return [...(await listPromise)].sort((a, b) => a.name.localeCompare(b.name)); } catch (err) { listPromise = null; throw err; }
}
export async function photoObjectUrl(photo) {
  const cache = await openCache();
  let res = cache && (await cache.match(photo.key));
  if (!res) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(photo.name, SIGNED_URL_SECONDS);
    if (error) throw error;
    res = await fetch(data.signedUrl);
    if (!res.ok) throw new Error(`Photo download failed (${res.status})`);
    if (cache) await cache.put(photo.key, res.clone());
  }
  return URL.createObjectURL(await res.blob());
}

// Keeps only the previous, current and next photos in memory.
function trimMemory() {
  const n = state.photos.length;
  const keep = new Set([-1, 0, 1].map((d) => state.photos[(state.index + d + n) % n].key));
  for (const [key, p] of state.urls) {
    if (!keep.has(key)) {
      p.then((u) => URL.revokeObjectURL(u)).catch(() => {});
      state.urls.delete(key);
    }
  }
}

function liveViews() {
  for (const v of state.views) if (!v.root.isConnected) state.views.delete(v);
  return [...state.views];
}

async function show() {
  const n = state.photos.length;
  if (!n) return;
  const i = state.index;
  const photo = state.photos[i];
  let url = null;
  try { url = await photoUrl(photo); } catch (err) { console.warn('Photo not loaded', photo.name, err); }
  if (i !== state.index) return; // moved on while loading
  for (const v of liveViews()) {
    v.root.classList.toggle('photo-failed', !url);
    if (url) await swapIn(v, url, photo.name);
  }
  if (n > 1) photoUrl(state.photos[(i + 1) % n]).catch(() => {}); // preload next
  trimMemory();
}

// Shows a photo on the hidden layer, then brings it in (fade, zoom or straight swap).
async function swapIn(view, url, name) {
  const [front, back] = view.front ? [view.imgs[1], view.imgs[0]] : [view.imgs[0], view.imgs[1]];
  if (front.classList.contains('on') && front.src === url) { frame(view, front); return; }
  back.src = url;
  back.dataset.name = name || '';
  try { await back.decode(); } catch { /* shown anyway */ }
  if (!view.full && name && !getFocus(name)) await autoFocus(name, back);
  frame(view, back);
  back.classList.remove('kb');
  void back.offsetWidth; // restarts the slow zoom
  back.classList.add('on', 'kb');
  front.classList.remove('on');
  view.front = !view.front;
}

// First time a photo is shown: look for faces once and save the point to crop on.
// No face: the default (slightly high) point is saved so it is not checked again.
const checking = new Map();
function autoFocus(name, img) {
  if (!checking.has(name)) {
    const run = (async () => {
      try {
        const { findFocus } = await import('../../core/face-focus.js');
        const f = await Promise.race([findFocus(img), new Promise((r) => setTimeout(() => r(undefined), 4000))]);
        if (f === undefined) return; // too slow this time: try again next time it is shown
        const p = f || DEFAULT_FOCUS;
        setFocus(name, p.x, p.y);
      } catch (err) { console.warn('Face check skipped', name, err); }
    })();
    checking.set(name, run);
    run.finally(() => { if (!getFocus(name)) checking.delete(name); });
  }
  return checking.get(name);
}

// Crops around the photo's focus point (see core/photo-focus.js). Full screen shows the whole photo.
function frame(view, img) {
  if (view.full || !img.naturalWidth) { img.style.objectPosition = ''; return; }
  const box = view.root.getBoundingClientRect();
  img.style.objectPosition = positionFor(getFocus(img.dataset.name), img.naturalWidth, img.naturalHeight, box.width, box.height);
}

// Re-frames the visible photos (after a focus point changes, or the card resizes).
export function reframePhotos() {
  for (const v of liveViews()) v.imgs.forEach((img) => frame(v, img));
}

function styleView(view) {
  view.root.dataset.effect = state.cfg.effect;
  view.root.style.setProperty('--slide', `${state.cfg.secs + FADE_S + 0.5}s`);
}

function schedule() {
  clearTimeout(state.timer);
  liveViews().forEach((v) => v.root.classList.toggle('paused', state.paused));
  if (state.paused || state.photos.length < 2 || !liveViews().length || document.hidden) return;
  state.timer = setTimeout(() => go(1), state.cfg.secs * 1000);
}

function go(delta) {
  const n = state.photos.length;
  if (!n) return;
  state.index = (state.index + delta + n) % n;
  refreshCfg();
  show();
  schedule();
}

document.addEventListener('visibilitychange', schedule);

// Called by Settings after a new set of photos is chosen.
export function resetPhotos() {
  clearTimeout(state.timer);
  for (const p of state.urls.values()) p.then((u) => URL.revokeObjectURL(u)).catch(() => {});
  state.urls.clear();
  state.photos = [];
  state.index = 0;
  listPromise = null;
}

function mountView(container, full) {
  container.innerHTML = `
    <div class="photo-view${full ? ' full' : ''}">
      <img alt="" draggable="false"><img alt="" draggable="false">
      <p class="photo-msg muted">This photo could not load.</p>
      <button class="icon-btn photo-pause" type="button"></button>
    </div>`;
  const root = container.firstElementChild;
  const btn = root.querySelector('.photo-pause');
  const view = {
    root,
    imgs: [...root.querySelectorAll('img')],
    front: false,
    full,
    updatePause() {
      btn.innerHTML = state.paused ? PLAY : PAUSE;
      btn.setAttribute('aria-label', state.paused ? 'Play slideshow' : 'Pause slideshow');
    },
  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    state.paused = !state.paused;
    liveViews().forEach((v) => v.updatePause());
    schedule();
  });

  // Swipe left or right to skip, tap to open full screen. Ignored in Edit mode.
  let start = null;
  root.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button') || root.closest('.editing')) return;
    start = { x: e.clientX, y: e.clientY };
  });
  root.addEventListener('pointercancel', () => { start = null; });
  root.addEventListener('pointerup', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    start = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
    else if (!full && Math.abs(dx) < 10 && Math.abs(dy) < 10) openOverlay('Photos', (c) => startView(c, true));
  });

  if ('ResizeObserver' in window) new ResizeObserver(() => view.imgs.forEach((img) => frame(view, img))).observe(root);
  state.views.add(view);
  styleView(view);
  view.updatePause();
}

const WAIT = '<p class="muted photo-wait">Your photos will appear after this morning\'s check-in.</p>';

async function startView(container, full) {
  try { await getTodayCheckin(); } catch { /* treated as not done */ }
  if (!checkinDoneToday()) {
    container.innerHTML = WAIT;
    window.addEventListener('sf:checkin-done', () => {
      if (container.isConnected) startView(container, full);
    }, { once: true });
    return;
  }
  if (!state.photos.length) {
    container.innerHTML = '<p class="muted">Loading photos...</p>';
    try {
      listPromise = listPromise || loadList();
      state.photos = await listPromise;
    } catch (err) {
      listPromise = null;
      console.warn('Photo list failed', err);
      container.innerHTML = '<p class="muted">Photos are not available right now.</p>';
      return;
    }
  }
  if (!state.photos.length) {
    container.innerHTML = '<p class="muted">No photos yet. Choose some in Settings.</p>';
    return;
  }
  mountView(container, full);
  state.cfgAt = 0;
  refreshCfg();
  await show();
  schedule();
}

export default {
  id: 'photos',
  title: 'Photos',
  defaultSize: { phone: { w: 4, h: 5 }, desktop: { w: 6, h: 5 } },
  // Not awaited, so a slow first photo download does not hold up other tiles.
  render(container) { startView(container, false); },
  renderExpanded(container) { return startView(container, true); },
  // Calm Home photo card: same slideshow, awaited so the caller can tell if it loaded.
  renderInline(container) { return startView(container, false); },
};
