const CACHE = 'neon-rally-v0.10.12';
const PRECACHE = [
  './',
  './index.html',
  './src/app.js',
  './src/state.js',
  './src/hud.js',
  './src/trackManager.js',
  './src/race.js',
  './src/gameLoop.js',
  './src/car.js',
  './src/renderer.js',
  './src/track.js',
  './src/ai.js',
  './src/audio.js',
  './src/controls.js',
  './src/powerups.js',
  './src/touch.js',
  './src/splash.js',
  './src/menu.js',
  './src/session.js',
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
