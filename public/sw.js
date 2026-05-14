/**
 * Service Worker para Hausdame PWA.
 *
 * Estrategia: network-only (sin caché de datos sensibles).
 * Soporta push notifications via Web Push API.
 */

const SW_VERSION = 'v3';

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
  console.log('[SW] push recibido', new Date().toISOString());

  if (!event.data) {
    console.log('[SW] push sin datos, ignorando');
    return;
  }

  let payload;
  try {
    payload = event.data.json();
    console.log('[SW] payload parseado:', JSON.stringify(payload));
  } catch {
    payload = { title: 'Hausdame', body: event.data.text() };
    console.log('[SW] payload como texto:', payload.body);
  }

  const title = payload.title || 'Hausdame';
  const options = {
    body:              payload.body || '',
    icon:              payload.icon  || '/icons/icon-192.png',
    badge:             payload.badge || '/icons/icon-192.png',
    vibrate:           [200, 100, 200],
    tag:               payload.tag  || 'hausdame',
    renotify:          true,
    requireInteraction: false,
    data: {
      href: payload.href || '/',
    },
  };

  const showAndBadge = async () => {
    console.log('[SW] ejecutando showNotification');
    await self.registration.showNotification(title, options);

    // Badging API — muestra indicador en el ícono de la PWA al llegar push
    if ('setAppBadge' in navigator) {
      try {
        // Si el payload incluye un conteo exacto lo usamos, si no mostramos punto genérico
        const count = typeof payload.badgeCount === 'number' ? payload.badgeCount : undefined;
        await navigator.setAppBadge(count);
      } catch {
        // falla silenciosamente
      }
    }
  };

  event.waitUntil(showAndBadge());
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
