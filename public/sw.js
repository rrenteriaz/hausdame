/**
 * Service Worker mínimo para Hausdame PWA.
 *
 * Estrategia: network-only (sin caché).
 * - Cumple el requisito de instalabilidad PWA en Chrome/Android.
 * - No cachea datos sensibles, páginas de auth ni estados dinámicos.
 * - Si en el futuro se quiere pre-cachear assets estáticos, hacerlo
 *   únicamente para archivos con hash en el nombre (/_next/static/...).
 */

const SW_VERSION = 'v1';

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
  // Esto es suficiente para cumplir el requisito de fetch handler del PWA.
  event.respondWith(fetch(event.request));
});
