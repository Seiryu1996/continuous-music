// Service Worker for background playback support
const CACHE_NAME = 'continuous-music-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/favicon.svg',
  '/manifest.json'
];

// Install event
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// Fetch event
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached version or fetch from network
        return response || fetch(event.request);
      }
    )
  );
});

// Activate event
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Background sync for keeping music alive
self.addEventListener('sync', event => {
  if (event.tag === 'background-music') {
    event.waitUntil(handleBackgroundMusic());
  }
});

async function handleBackgroundMusic() {
  // Keep service worker alive for background music
  console.log('Background music sync triggered');
}

// Message handling from main thread
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'KEEP_ALIVE') {
    // Respond to keep-alive messages
    event.ports[0].postMessage({type: 'KEEP_ALIVE_RESPONSE'});
  }
});