// Service worker: caches the whole app on install so it launches offline.
// Bump VERSION whenever any file changes, so clients pick up the new build.
const VERSION = 'v1';
const CACHE = `chuckie-egg-${VERSION}`;
const FILES = [
  './', 'index.html', 'style.css', 'manifest.webmanifest',
  'src/main.js',
  'src/game/consts.js', 'src/game/map.js', 'src/game/sfx.js', 'src/game/scoring.js', 'src/game/duck.js',
  'src/game/player.js', 'src/game/hens.js', 'src/game/lifts.js', 'src/game/machine.js',
  'src/render/screen.js', 'src/render/audio.js',
  'src/input/keyboard.js', 'src/input/gamepad.js', 'src/input/touch.js',
  'data/levels.json', 'data/graphics.json', 'data/rng.json',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// cache first, falling back to the network (and caching what it returns)
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((res) => {
    if (res.ok && new URL(e.request.url).origin === location.origin) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
    }
    return res;
  })));
});
