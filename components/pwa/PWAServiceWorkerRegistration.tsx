'use client';

import { useEffect } from 'react';

/**
 * Registra el service worker de Hausdame en el cliente.
 * No renderiza nada visible — solo efecto de montaje.
 */
export default function PWAServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        if (process.env.NODE_ENV === 'development') {
          console.log('[PWA] Service Worker registrado:', registration.scope);
        }
      })
      .catch((err) => {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[PWA] Error al registrar Service Worker:', err);
        }
      });
  }, []);

  return null;
}
