/**
 * Service Worker para Hausdame PWA.
 *
 * Estrategia: network-only (sin caché de datos sensibles).
 * Soporta push notifications via Web Push API.
 */

const SW_VERSION = 'v2';

self.addEventListener('install', () => {
  // Activa inmediatamente sin esperar a que cierren las pestañas antiguas.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Toma control de todas las pestañas abiertas de inmediato.
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pasar todo al network sin tocar la caché.
  event.respondWith(fetch(event.request));
});

// ── Push Notifications ─────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Hausdame', body: event.data.text() };
  }

  const title = payload.title || 'Hausdame';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192.png',
    badge: payload.badge || '/icons/icon-192.png',
    data: {
      href: payload.href || '/',
    },
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const href = event.notification.data?.href || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Intentar enfocar una pestaña existente con la misma URL
        for (const client of clientList) {
          if (client.url === href && 'focus' in client) {
            return client.focus();
          }
        }
        // Intentar enfocar cualquier pestaña abierta y navegar
        for (const client of clientList) {
          if ('focus' in client) {
            client.focus();
            if ('navigate' in client) {
              return client.navigate(href);
            }
            return;
          }
        }
        // Abrir nueva pestaña si no hay ninguna
        if (self.clients.openWindow) {
          return self.clients.openWindow(href);
        }
      })
  );
});
