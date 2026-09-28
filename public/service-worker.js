/*
 * Kill switch for the old site's service worker.
 *
 * The 2020 Create React App build registered a Workbox worker at this path that
 * serves a cached copy of the old site. Browsers re-check this file on
 * navigation; when they find this version they install it, and it wipes every
 * cache, unregisters itself, and reloads open tabs so they load the new site
 * from the network. The new site never registers a service worker.
 */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      await Promise.all(clients.map((client) => client.navigate(client.url).catch(() => {})));
    })(),
  );
});
