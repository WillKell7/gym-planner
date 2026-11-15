/*
 * Service worker: makes the app open and work with no signal.
 * App files load from the network when possible (so updates show up straight
 * away) and fall back to the saved copy when offline.
 * Bump VERSION when you add or rename files below.
 */
var VERSION = 'v19';
var CACHE = 'sub20-' + VERSION;
var FILES = [
  './', 'index.html', 'manifest.webmanifest',
  'css/app.css', 'css/sync.css',
  'js/config.js', 'js/vendor/supabase.js', 'js/sync.js', 'js/app.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('sub20-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function timeout(ms) { return new Promise(function (_, rej) { setTimeout(rej, ms); }); }

self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;

  // Google Fonts: cache forever once fetched.
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.open(CACHE).then(function (c) {
      return c.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) { c.put(req, res.clone()); return res; });
      });
    }));
    return;
  }
  // Only this site's own files; Supabase calls go straight to the network.
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    // 'no-cache' makes the browser check with the server each time, so a new deploy shows up straight away
    // instead of up to 10 minutes later.
    Promise.race([fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }), timeout(4000)]).then(function (res) {
      if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (hit) {
        return hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error());
      });
    })
  );
});
