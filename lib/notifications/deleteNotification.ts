// lib/notifications/deleteNotification.ts
// Soft delete: sets deletedAt. Never hard-deletes (preserves audit trail).
import prisma from "@/lib/prisma";

export async function deleteNotification(
  notificationId: string,
  userId: string
): Promise<boolean> {
  try {
    const result = await prisma.notification.updateMany({
      where: { id: notificationId, userId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return result.count > 0;
  } catch {
    return false;
  }
}
