// hooks/usePushNotifications.ts
"use client";

import { useState, useCallback } from "react";

export type PushPermissionState =
  | "unsupported"
  | "denied"
  | "default"
  | "granted"
  | "subscribed"
  | "error";

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

export function usePushNotifications() {
  const [state, setState] = useState<PushPermissionState>(() => {
    if (!isPushSupported()) return "unsupported";
    const perm = Notification.permission;
    if (perm === "denied") return "denied";
    if (perm === "granted") return "granted";
    return "default";
  });

  const subscribe = useCallback(async () => {
    if (!isPushSupported()) {
      setState("unsupported");
      return;
    }

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) {
      console.warn("[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY no configurada.");
      setState("error");
      return;
    }

    try {
      // Pedir permiso (solo se ejecuta por acción explícita del usuario)
      const permission = await Notification.requestPermission();
      if (permission === "denied") {
        setState("denied");
        return;
      }
      if (permission !== "granted") {
        setState("default");
        return;
      }

      // Registrar service worker si no está registrado
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

      // Enviar suscripción al backend
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint, keys }),
      });

      if (!res.ok) {
        throw new Error("Error registrando suscripción en el servidor");
      }

      setState("subscribed");
    } catch (err) {
      console.error("[push] Error suscribiendo:", err);
      setState("error");
    }
  }, []);

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
    } catch (err) {
      console.error("[push] Error desuscribiendo:", err);
    }
  }, []);

  return { state, subscribe, unsubscribe, isSupported: isPushSupported() };
}
