// hooks/usePushNotifications.ts
"use client";

import { useState, useRef, useCallback, useEffect } from "react";

export type PushPermissionState =
  | "unsupported"  // navegador sin soporte
  | "denied"       // usuario denegó el permiso
  | "default"      // permiso no solicitado aún
  | "granted"      // permiso concedido, sin suscripción activa
  | "subscribing"  // en proceso de suscribir (loading)
  | "subscribed"   // suscripción activa registrada en el servidor
  | "error";       // error genérico (ver pushError para detalle)

function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export interface UsePushNotificationsResult {
  state: PushPermissionState;
  /** Mensaje de error legible cuando state === "error". Null en otros estados. */
  pushError: string | null;
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
  isSupported: boolean;
}

export function usePushNotifications(): UsePushNotificationsResult {
  const [state, setState] = useState<PushPermissionState>(() => {
    if (!isPushSupported()) return "unsupported";
    const perm = Notification.permission;
    if (perm === "denied") return "denied";
    if (perm === "granted") return "granted";
    return "default";
  });

  // Mensaje legible del último error — se limpia al iniciar un nuevo intento
  const [pushError, setPushError] = useState<string | null>(null);

  // Restaurar estado desde suscripción existente en el browser (Service Worker)
  useEffect(() => {
    if (!isPushSupported()) return;
    if (Notification.permission !== "granted") return;

    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((sub) => {
        if (sub) setState("subscribed");
      })
      .catch(() => {
        // No bloqueante — si falla, estado queda en "granted"
      });
  }, []);

  const setError = useCallback((msg: string) => {
    setState("error");
    setPushError(msg);
  }, []);

  const subscribe = useCallback(async () => {
    if (!isPushSupported()) {
      setState("unsupported");
      return;
    }

    // Limpiar error previo y mostrar loading inmediatamente
    setPushError(null);
    setState("subscribing");

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) {
      setError("Faltan claves VAPID para activar notificaciones push.");
      return;
    }

    try {
      // Pedir permiso (solo por acción explícita del usuario)
      const permission = await Notification.requestPermission();
      if (permission === "denied") {
        setState("denied");
        setPushError(null);
        return;
      }
      if (permission !== "granted") {
        // Usuario cerró el diálogo sin decidir
        setState("default");
        setPushError(null);
        return;
      }

      // Registrar service worker
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
      });
      await navigator.serviceWorker.ready;

      // Suscribir al push manager
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey).buffer as ArrayBuffer,
      });

      const { endpoint, keys } = subscription.toJSON() as {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };

      // Registrar en el servidor
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint, keys }),
      });

      if (!res.ok) {
        throw new Error(`El servidor rechazó la suscripción (${res.status}).`);
      }

      setState("subscribed");
      setPushError(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error desconocido.";
      setError(`Error al activar notificaciones. ${message}`);
    }
  }, [setError]);

  const unsubscribe = useCallback(async () => {
    if (!isPushSupported()) return;

    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      if (!registration) return;

      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        setState("granted");
        return;
      }

      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();

      await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      });

      setState("granted");
      setPushError(null);
    } catch {
      // Error al desuscribir — no crítico
    }
  }, []);

  return { state, pushError, subscribe, unsubscribe, isSupported: isPushSupported() };
}
