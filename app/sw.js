/* ─── Prevoya service worker — PUSH ONLY (PUSH_SPEC §1.1) ─────────────
 * Deliberately NO fetch/caching handlers: the F4 update chip owns
 * staleness via ETag, and a misbehaving caching SW can freeze a PWA.
 * This file wakes for a push, shows the morning note, routes the tap. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) {}
  if (!d.body && !d.title) return; /* empty pushes show nothing — never noise */
  e.waitUntil(self.registration.showNotification(d.title || 'Prevoya', {
    body: d.body || '',
    icon: '/app/icon-180.png',
    badge: '/app/icon-180.png',
    data: { url: d.url || '/app/' }
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/app/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
    for (const w of wins) {
      if (w.url.indexOf('/app') !== -1 && 'focus' in w) {
        if ('navigate' in w) w.navigate(url);
        return w.focus();
      }
    }
    return self.clients.openWindow(url);
  }));
});
