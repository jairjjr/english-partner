// Service Worker para English Partner PWA (Estrategia Network-First con Respaldo Offline)
const CACHE_NAME = 'english-partner-v4.0.0';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css?v=4',
  './js/config.js?v=4',
  './js/curriculum.js?v=4',
  './js/audio-vad.js?v=4',
  './js/voice-engine.js?v=4',
  './js/evaluator.js?v=4',
  './js/sync.js?v=4',
  './js/app.js?v=4'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Las llamadas a APIs externas (Gemini / Google Apps Script) van directo a la red
  if (
    event.request.url.includes('generativelanguage.googleapis.com') ||
    event.request.url.includes('script.google.com')
  ) {
    return;
  }

  // Estrategia Network-First: siempre intenta descargar la versión más reciente de GitHub Pages
  // y si no hay señal celular en la camioneta, usa la copia guardada en caché.
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
          if (cachedResponse) {
            return cachedResponse;
          }
          if (event.request.destination === 'document') {
            return caches.match('./index.html');
          }
        });
      })
  );
});
