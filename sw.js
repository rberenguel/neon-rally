const CACHE = 'neon-rally-v2';
const PRECACHE = [
  './',
  './index.html',
  './app.js',
  './car.js',
  './renderer.js',
  './track.js',
  './ai.js',
  './audio.js',
  './controls.js',
  './powerups.js',
  './touch.js',
  './splash.js',
  './menu.js',
  './session.js',
  './icon.png',
  './icon192.png',
  './fonts/SixtyFour.woff2',
  './libs/Tone.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
