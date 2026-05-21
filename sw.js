const CACHE = 'sendmaster-v1';
const SHELL = ['/', '/index.html', '/favicon.ico', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  // Do NOT call skipWaiting here — the page controls when to apply an update
  // so it can show a notification first. On first install there is no
  // competing SW so the browser activates this one immediately anyway.
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
        .then(res => { caches.open(CACHE).then(c => c.put(request, res.clone())); return res; })
        .catch(() => caches.match(request) || caches.match('/'))
    );
    return;
  }

  // Everything else: cache-first
  e.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(res => {
      if (res.ok) caches.open(CACHE).then(c => c.put(request, res.clone()));
      return res;
    }))
  );
});
