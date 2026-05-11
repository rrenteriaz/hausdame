'use client';

import { useEffect, useRef, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

export type PWAInstallStatus =
  | 'loading'      // useEffect aún no corrió (SSR-safe)
  | 'standalone'   // ya instalada como app
  | 'android'      // beforeinstallprompt disponible
  | 'ios'          // iPhone/iPad en Safari — instalación manual
  | 'unsupported'; // navegador no soporta instalación

export interface UsePWAInstallResult {
  status: PWAInstallStatus;
  /** Solo disponible cuando status === 'android'. Dispara el prompt nativo. */
  triggerInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
}

export function usePWAInstall(): UsePWAInstallResult {
  const [status, setStatus] = useState<PWAInstallStatus>('loading');
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;

    if (isStandalone) {
      setStatus('standalone');
      return;
    }

    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    if (isIOS && isSafari) {
      setStatus('ios');
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      promptRef.current = e as BeforeInstallPromptEvent;
      setStatus('android');
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Si beforeinstallprompt no disparó en 600ms → navegador no soportado
    const timer = window.setTimeout(() => {
      setStatus((prev) => (prev === 'loading' ? 'unsupported' : prev));
    }, 600);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.clearTimeout(timer);
    };
  }, []);

  const triggerInstall = async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    const prompt = promptRef.current;
    if (!prompt) return 'unavailable';
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    promptRef.current = null;
    // El prompt fue consumido — ya no disponible
    setStatus('unsupported');
    return outcome;
  };

  return { status, triggerInstall };
}
