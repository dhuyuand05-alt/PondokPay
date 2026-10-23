const CACHE_NAME = 'pondokpay-shell-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name.startsWith('pondokpay-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      ).then(() => self.clients.claim()),
    ),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok) {
            await (await caches.open(CACHE_NAME)).put('/', response.clone());
          }
          return response;
        } catch {
          return (await caches.match('/')) || Response.error();
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      try {
        const response = await fetch(request);
        if (response.ok) {
          await (await caches.open(CACHE_NAME)).put(request, response.clone());
        }
        return response;
      } catch {
        return cached || Response.error();
      }
    })(),
  );
});
