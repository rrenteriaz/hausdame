'use client';

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

const DISMISSED_KEY = 'hd-pwa-banner-dismissed';

/**
 * Banner discreto de instalación PWA.
 *
 * - Android: usa el evento `beforeinstallprompt` para mostrar el botón nativo.
 * - iOS: muestra instrucciones manuales (Compartir → Agregar a pantalla de inicio).
 * - No aparece si la app ya está en modo standalone (ya instalada).
 * - Persiste el "no mostrar más" en localStorage.
 */
export default function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSHint, setShowIOSHint] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Ya instalada como app standalone → no mostrar nada
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;

    if (isStandalone) return;

    // El usuario ya descartó el banner
    if (localStorage.getItem(DISMISSED_KEY)) return;

    // Detectar iOS (Safari no dispara beforeinstallprompt)
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    if (isIOS && isSafari) {
      setShowIOSHint(true);
      setVisible(true);
      return;
    }

    // Android / Chrome: esperar el evento de instalación
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted' || outcome === 'dismissed') {
      dismiss();
    }
  };

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="banner"
      aria-label="Instalar Hausdame"
      className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-sm"
    >
      <div className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-white p-4 shadow-xl">
        {/* Ícono */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/icon-192-v2.png"
          alt="Hausdame"
          width={44}
          height={44}
          className="shrink-0 rounded-xl"
        />

        {/* Texto */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">Instala Hausdame</p>
          <p className="mt-0.5 text-xs text-gray-500 leading-snug">
            Accede más rápido y abre Hausdame como app, sin barra del navegador.
          </p>

          {showIOSHint ? (
            <p className="mt-2 text-xs text-blue-600 font-medium">
              En iPhone: toca{' '}
              <span className="inline-flex items-center gap-0.5">
                Compartir <ShareIcon />
              </span>{' '}
              → <strong>Agregar a pantalla de inicio</strong>
            </p>
          ) : (
            <button
              onClick={handleInstall}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
            >
              Instalar
            </button>
          )}
        </div>

        {/* Cerrar */}
        <button
          onClick={dismiss}
          aria-label="Cerrar"
          className="shrink-0 rounded-md p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M1 1l12 12M13 1L1 13"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="inline">
      <path
        d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
