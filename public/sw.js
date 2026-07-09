self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(clients.claim()); });
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cls) => {
    if (cls.length > 0) cls[0].focus();
    else clients.openWindow('/');
  }));
});
self.addEventListener('push', (e) => {
  const d = e.data ? e.data.json() : {};
  e.waitUntil(self.registration.showNotification(d.title || 'Football Alert', {
    body: d.body || '', icon: d.icon || '/favicon.ico', tag: d.tag || 'fx', vibrate: [100, 50, 100],
  }));
});