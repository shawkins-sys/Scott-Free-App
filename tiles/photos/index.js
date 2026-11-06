// Photos tile. Shuffled slideshow from the private `photos` bucket
// (filled from Google Photos via Settings, or uploaded in Supabase).
// 8 seconds per photo, swipe to skip, tap for full screen, pause button.
// Each photo is saved to Cache Storage the first time it is shown, so it
// is only downloaded once. Shown after the morning check-in.
import { supabase } from '../../core/supabase.js';
import { getTodayCheckin, checkinDoneToday } from '../../core/wellbeing.js';
import { openOverlay } from '../../core/overlay.js';

const BUCKET = 'photos';
const CACHE_NAME = 'sf-photos'; // kept across app updates (see sw.js)
const SLIDE_MS = 8000;
const SIGNED_URL_SECONDS = 3600;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif)$/i; // HEIC is not supported by Chrome

const PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="5" width="3.5" height="14" rx="1"/><rect x="13.5" y="5" width="3.5" height="14" rx="1"/></svg>';
const PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.9l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5z"/></svg>';

// One shared slideshow, so the tile and full screen view stay in step.
const state = { photos: [], index: 0, paused: false, views: new Set(), timer: null, urls: new Map() };
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
    if (url) v.img.src = url;
  }
  if (n > 1) photoUrl(state.photos[(i + 1) % n]).catch(() => {}); // preload next
  trimMemory();
}

function schedule() {
  clearTimeout(state.timer);
  if (state.paused || state.photos.length < 2 || !liveViews().length || document.hidden) return;
  state.timer = setTimeout(() => go(1), SLIDE_MS);
}

function go(delta) {
  const n = state.photos.length;
  if (!n) return;
  state.index = (state.index + delta + n) % n;
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
      <img alt="" draggable="false">
      <p class="photo-msg muted">This photo could not load.</p>
      <button class="icon-btn photo-pause" type="button"></button>
    </div>`;
  const root = container.firstElementChild;
  const btn = root.querySelector('.photo-pause');
  const view = {
    root,
    img: root.querySelector('img'),
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

  state.views.add(view);
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
    container.innerHTML = '<p class="muted">No photos yet. Choose some in Settings, at the bottom of Home.</p>';
    return;
  }
  mountView(container, full);
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
};
