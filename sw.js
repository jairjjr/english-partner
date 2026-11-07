// Service Worker para English Partner PWA
const CACHE_NAME = 'english-partner-v1.0.0';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/config.js',
  './js/curriculum.js',
  './js/audio-vad.js',
  './js/voice-engine.js',
  './js/evaluator.js',
  './js/sync.js',
  './js/app.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
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
  // Las llamadas a APIs externas (Gemini / Google Apps Script) siempre van a la red
  if (
    event.request.url.includes('generativelanguage.googleapis.com') ||
    event.request.url.includes('script.google.com')
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).catch(() => {
        // Fallback básico si está sin conexión
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

