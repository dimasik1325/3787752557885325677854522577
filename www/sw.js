const CACHE_NAME = 'arcada-static-v1';
const APP_FILES = [
  './', './index.html', './styles.css', './app.js', './manifest.webmanifest',
  './assets/arcade-icon.svg', './assets/icon-192.png', './assets/icon-512.png',
  './games/shared.js', './games/pacman.js', './games/snake.js',
  './games/solitaire.js', './games/minesweeper.js', './games/blockblast.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    if (response && response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
    }
    return response;
  }).catch(() => request.mode === 'navigate' ? caches.match('./index.html') : Response.error())));
});
