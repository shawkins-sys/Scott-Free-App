// Scott Free service worker.
// App files: network first, so edits made on GitHub go live, with the cache as
// the offline fallback. Pinned CDN libraries: cache first. Supabase and other
// APIs are never cached here.

const VERSION = 'sf-v11';
const SHELL_CACHE = `${VERSION}-shell`;
const CDN_CACHE = `${VERSION}-cdn`;

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
  './core/quiet-lines.js',
  './core/google.js',
  './core/money.js',
  './core/theme.css',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

const CDN_HOSTS = ['cdn.jsdelivr.net', 'esm.sh'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  // Old app caches are removed. The sf-photos cache is kept across updates.
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !k.startsWith(VERSION) && k !== 'sf-photos').map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(req));
  } else if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(req));
  }
  // Anything else (Supabase, weather, etc.) goes straight to the network.
});

async function networkFirst(req) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') return cache.match('./index.html');
    throw new Error('Offline and not cached');
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CDN_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}
