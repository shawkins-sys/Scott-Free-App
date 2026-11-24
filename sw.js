// Scott Hub service worker.
// App files: cache first (fast start). Every release bumps VERSION, so the
// browser installs this worker again and it downloads the whole new set fresh
// (bypassing the browser's own cache) before taking over; the new version
// shows the next time the app is opened. Pinned CDN libraries: cache first. Supabase and other
// APIs are never cached here.

const VERSION = 'sf-v91';
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
  './core/timers.js',
  './core/alarms.js',
  './core/morning.js',
  './hubs/morning/index.js',
  './hubs/settings/morning.js',
  './core/habits.js',
  './core/livedot.js',
  './core/applink.js',
  './core/backup.js',
  './core/background.js',
  './core/quiet-lines.js',
  './core/google.js',
  './core/money.js',
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
  './hubs/plan/index.js',
  './hubs/plan/shopping.js',
  './hubs/plan/timers.js',
  './hubs/plan/alarms.js',
  './hubs/plan/renewals.js',
  './hubs/settings/timers.js',
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
    caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
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
    event.respondWith(appFile(req));
  } else if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(req));
  }
  // Anything else (Supabase, weather, etc.) goes straight to the network.
});

// Saved copy from this release if there is one, otherwise the network (and
// keep it for next time). Navigations (any path or ?query) get index.html.
async function appFile(req) {
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match(req, { ignoreSearch: true })
    || (req.mode === 'navigate' ? await cache.match('./index.html') : null);
  if (hit) return hit;
  try {
    const res = await fetch(req, { cache: 'no-cache' });
    if (res.ok && req.mode !== 'navigate') cache.put(req, res.clone());
    return res;
  } catch {
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
