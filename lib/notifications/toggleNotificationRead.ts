import prisma from "@/lib/prisma";

/**
 * Alterna readAt: null → now() si no leída, now() → null si ya leída.
 * Retorna el nuevo valor de readAt, o undefined si la notificación no existe / no pertenece al usuario.
 */
export async function toggleNotificationRead(
  notificationId: string,
  userId: string
): Promise<{ readAt: Date | null } | null> {
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, userId, deletedAt: null },
    select: { readAt: true },
  });

  if (!notification) return null;

  const newReadAt = notification.readAt ? null : new Date();

  await prisma.notification.update({
    where: { id: notificationId },
    data: { readAt: newReadAt },
  });

  return { readAt: newReadAt };
}
