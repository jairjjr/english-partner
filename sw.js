// Service Worker para English Partner PWA (v8.0.0 Scorched Earth Cache & Network-First)
const CACHE_NAME = 'english-partner-v8.0.0';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css?v=8.0',
  './js/config.js?v=8.0',
  './js/curriculum.js?v=8.0',
  './js/audio-vad.js?v=8.0',
  './js/voice-engine-v7.js?v=8.0',
  './js/evaluator-v5.js?v=8.0',
  './js/sync.js?v=8.0',
  './js/app-v7.js?v=8.0'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Purgando caché obsoleta:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Nunca cachear llamadas a APIs remotas de Google o Google Apps Script
  if (
    event.request.url.includes('generativelanguage.googleapis.com') ||
    event.request.url.includes('script.google.com')
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (event.request.destination === 'document') {
            return caches.match('./index.html');
          }
          return new Response('Offline', { status: 503, statusText: 'Offline' });
        });
      })
  );
});
