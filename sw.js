/* ========================================================
   PCF - sw.js — Service Worker (PWA)
   Estratégia network-first: sempre busca a versão atual e só
   usa o cache quando estiver offline. Firebase/Firestore e
   requisições de outras origens não passam pelo cache.
   ======================================================== */
const CACHE_NAME = 'pcf-shell-v5';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './Img/icons/icon-192.png',
  './Img/icons/icon-512.png',
  './Img/icons/favicon-64.png',
  './Img/logo-pcf.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: req.mode === 'navigate' })
        .then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined))
        .then(hit => hit || Response.error()))
  );
});
