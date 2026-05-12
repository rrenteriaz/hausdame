// lib/notifications/createNotification.ts
import prisma from "@/lib/prisma";
import type { NotificationType } from "@/lib/generated/prisma";
import { sendPushToSubscription } from "./push";

export interface CreateNotificationInput {
  tenantId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  href?: string;
  data?: Record<string, unknown> | null;
  /** Clave de deduplicación. Si se provee, evita crear duplicados para mismo userId+dedupeKey. */
  dedupeKey?: string;
  /** Si true, intenta enviar push al usuario. Un fallo de push no bloquea la creación. */
  sendPush?: boolean;
}

/**
 * Crea una notificación interna y opcionalmente dispara push.
 * Si dedupeKey ya existe para este userId, retorna null silenciosamente (idempotente).
 * Nunca lanza a menos que sea un error verdaderamente inesperado.
 */
export async function createNotification(
  input: CreateNotificationInput
): Promise<{ id: string } | null> {
  const { tenantId, userId, type, title, body, href, data, dedupeKey, sendPush } = input;

  try {
    const notification = await prisma.notification.create({
      data: {
        tenantId,
        userId,
        type,
        title,
        body,
        href,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: (data ?? undefined) as any,
        dedupeKey: dedupeKey ?? null,
      },
      select: { id: true },
    });

    if (sendPush) {
      // Fire-and-forget: nunca bloquea el flujo principal
      sendPushNotificationsToUser(userId, { title, body, href }).catch((err) => {
        console.error("[createNotification] Push falló (no bloqueante):", err);
      });
    }

    return notification;
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string };
    // P2002 = unique constraint violation (dedupeKey duplicado) → idempotente, ok
    if (error.code === "P2002") {
      return null;
    }
    console.error("[createNotification] Error inesperado:", error.message || err);
    return null;
  }
}

async function sendPushNotificationsToUser(
  userId: string,
  payload: { title: string; body: string; href?: string }
): Promise<void> {
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId, revokedAt: null },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });

  if (subscriptions.length === 0) return;

  const expiredIds: string[] = [];

  await Promise.all(
    subscriptions.map(async (sub) => {
      const ok = await sendPushToSubscription(sub, {
        title: payload.title,
        body: payload.body,
        href: payload.href,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
      });
      // 410 Gone retorna false → revocar
      if (!ok) expiredIds.push(sub.id);
    })
  );

  if (expiredIds.length > 0) {
    await prisma.pushSubscription.updateMany({
      where: { id: { in: expiredIds } },
      data: { revokedAt: new Date() },
    });
  }
}
