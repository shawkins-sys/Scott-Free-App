// Scott Hub service worker.
// App files: network first, so edits made on GitHub go live, with the cache as
// the offline fallback. Pinned CDN libraries: cache first. Supabase and other
// APIs are never cached here.

const VERSION = 'sf-v78';
const SHELL_CACHE = `${VERSION}-shell`;
// Pinned library versions never change, so this cache survives app updates.
const CDN_CACHE = 'sf-cdn';
const BG_CACHE = 'sf-bg'; // background art: saved on first view, kept across releases
// Keep in step with core/background.js (same ?v= values).
const BG_FALLBACK = ['./assets/bg/beach-phone-day.webp?v=2', './assets/bg/beach-phone-night.webp?v=2'];

const SHELL = [
  './',
  './index.html',
  './config.js',
  './registry.js',
  './manifest.webmanifest',
  './core/app.js',
  './core/auth.js',
  './core/supabase.js',
  './core/date.js',
  './core/grid.js',
  './core/icons.js',
  './core/layout-store.js',
  './core/overlay.js',
  './core/wellbeing.js',
  './core/checkin.js',
  './core/calendar.js',
  './core/keydates.js',
  './core/shopping.js',
  './core/habits.js',
  './core/livedot.js',
  './core/applink.js',
  './core/backup.js',
  './core/background.js',
  './core/quiet-lines.js',
  './core/google.js',
  './core/money.js',
  './core/payschedule.js',
  './core/statement.js',
  './core/statement-pdf.js',
  './core/spotify.js',
  './core/music.js',
  './core/breathing.js',
  './core/trends.js',
  './core/weekly.js',
  './core/applock.js',
  './core/device.js',
  './core/wall.js',
  './core/frame.js',
  './core/hubpin.js',
  './core/theme.css',
  './hubs/money/import.js',
  './hubs/money/index.js',
  './hubs/money/spending.js',
  './hubs/plan/index.js',
  './hubs/plan/shopping.js',
  './hubs/settings/index.js',
  './hubs/settings/music.js',
  './hubs/settings/phrases.js',
  './hubs/settings/habits.js',
  './hubs/settings/background.js',
  './hubs/settings/wall.js',
  './hubs/settings/backup.js',
  './hubs/settings/slideshow.js',
  './hubs/wellbeing/index.js',
  './hubs/wellbeing/trends.js',
  './tiles/calendar/index.js',
  './tiles/photos/index.js',
  './tiles/weather/index.js',
  './tiles/music/index.js',
  './tiles/lights/index.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

const CDN_HOSTS = ['cdn.jsdelivr.net', 'esm.sh'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL))
      // The beach is the offline fallback background, so it is always saved.
      .then(() => caches.open(BG_CACHE)).then((c) => c.addAll(BG_FALLBACK).catch(() => null))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  // Old app caches are removed. Photos and pinned libraries are kept across updates.
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !k.startsWith(VERSION) && k !== 'sf-photos' && k !== CDN_CACHE && k !== BG_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin && url.pathname.includes('/assets/bg/')) {
    event.respondWith(cacheFirst(req, BG_CACHE));
  } else if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(req));
  } else if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(req));
  }
  // Anything else (Supabase, weather, etc.) goes straight to the network.
});

async function networkFirst(req) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    // no-cache: always check with GitHub Pages for a newer file (a quick 304 if
    // unchanged). Without it the browser reuses its own copy for up to 10
    // minutes, so a new release could still show old screens after reopening.
    const res = await fetch(req, { cache: 'no-cache' });
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') return cache.match('./index.html');
    throw new Error('Offline and not cached');
  }
}

async function cacheFirst(req, name = CDN_CACHE) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}
