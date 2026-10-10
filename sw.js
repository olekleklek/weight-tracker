// Bump CACHE on every app change so phones pick up the new version.
// User data lives in localStorage, not here, so updates never touch it.
const CACHE = 'wt-v4';
const FILES = ['./', 'index.html', 'logic.js', 'manifest.json', 'icon.png'];

self.addEventListener('install', e => {
  // cache: 'reload' skips the HTTP cache (GitHub Pages sends max-age=600) so an update never stores stale files.
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
});
