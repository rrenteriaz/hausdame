// lib/notifications/push.ts
// Envío de push notifications via Web Push API.
// Si faltan las variables VAPID, desactiva el envío con un warning controlado.

import type { PushSubscription as PrismaPushSubscription } from "@/lib/generated/prisma";

let webPush: typeof import("web-push") | null = null;
let pushEnabled = false;

async function getWebPush() {
  if (webPush !== null) return webPush;

  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT;

  if (!vapidPublic || !vapidPrivate || !vapidSubject) {
    console.warn(
      "[push] VAPID keys no configuradas. Push notifications desactivadas. " +
        "Agrega NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY y VAPID_SUBJECT."
    );
    webPush = null;
    pushEnabled = false;
    return null;
  }

  const wp = await import("web-push");
  wp.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
  webPush = wp;
  pushEnabled = true;
  return wp;
}

export interface PushPayload {
  title: string;
  body: string;
  href?: string;
  icon?: string;
  badge?: string;
}

/**
 * Envía una push notification a una suscripción.
 * Nunca lanza: los errores se loggean y retornan false.
 */
export async function sendPushToSubscription(
  subscription: Pick<PrismaPushSubscription, "endpoint" | "p256dh" | "auth">,
  payload: PushPayload
): Promise<boolean> {
  const wp = await getWebPush();
  if (!wp) return false;

  try {
    await wp.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      },
      JSON.stringify(payload)
    );
    return true;
  } catch (err: unknown) {
    const error = err as { statusCode?: number; message?: string };
    // 410 Gone = suscripción expirada/revocada
    if (error.statusCode === 410) {
      return false; // caller debe revocar la suscripción
    }
    console.error("[push] Error enviando push:", error.message || err);
    return false;
  }
}

export { pushEnabled };
