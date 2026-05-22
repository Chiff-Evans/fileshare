const CACHE = 'sendmaster-v1';
const SHELL = ['/', '/index.html', '/favicon.ico', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', e => {
  const isUpdate = !!self.registration.active;
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.clients.matchAll({ includeUncontrolled: true, type: 'window' }))
      .then(clients => clients.forEach(c => c.postMessage({ type: 'SW_INSTALLED', isUpdate })))
  );
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache upload POSTs or file downloads — let those go straight to network
  if (url.pathname.startsWith('/upload') || url.pathname.match(/\/file\/\d+$/)) return;

  // Dynamic API — always network-only, never read from or write to cache
  const NEVER_CACHE = ['/stats', '/config.json', '/health'];
  if (NEVER_CACHE.some(p => url.pathname === p || url.pathname.startsWith(p + '/'))) {
    e.respondWith(fetch(request));
    return;
  }

  // API info endpoints: network-first so download pages always show fresh data
  if (url.pathname.match(/\/d\/[^/]+\/info$/)) {
    e.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // Navigation (HTML pages): network-first, fall back to cached index.html for offline
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then(res => {
          const clone = res.clone(); // clone synchronously before any async work
          caches.open(CACHE).then(c => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request) || caches.match('/'))
    );
    return;
  }

  // Everything else: cache-first
  e.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(res => {
      if (res.ok) {
        const clone = res.clone(); // clone synchronously before any async work
        caches.open(CACHE).then(c => c.put(request, clone));
      }
      return res;
    }))
  );
});
