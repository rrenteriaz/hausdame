// lib/notifications/markNotificationRead.ts
import prisma from "@/lib/prisma";

/**
 * Marca una notificación como leída si pertenece al usuario.
 * Idempotente: si ya está leída, no hace nada.
 */
export async function markNotificationAsRead(
  notificationId: string,
  userId: string
): Promise<boolean> {
  try {
    const result = await prisma.notification.updateMany({
      where: { id: notificationId, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return result.count > 0;
  } catch {
    return false;
  }
}

/**
 * Marca todas las notificaciones de un usuario como leídas.
 */
export async function markAllNotificationsAsRead(userId: string): Promise<number> {
  try {
    const result = await prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return result.count;
  } catch {
    return 0;
  }
}
