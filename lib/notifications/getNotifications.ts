// lib/notifications/getNotifications.ts
import prisma from "@/lib/prisma";
import type { Notification, NotificationType } from "@/lib/generated/prisma";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string | null;
  readAt: Date | null;
  createdAt: Date;
}

export interface GetNotificationsResult {
  notifications: NotificationItem[];
  total: number;
}

export async function getNotificationsForUser(
  userId: string,
  opts: { unreadOnly?: boolean; limit?: number; offset?: number } = {}
): Promise<GetNotificationsResult> {
  const { unreadOnly = false, limit = 30, offset = 0 } = opts;

  const where = {
    userId,
    ...(unreadOnly ? { readAt: null } : {}),
  };

  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        href: true,
        readAt: true,
        createdAt: true,
      },
    }),
    prisma.notification.count({ where }),
  ]);

  return { notifications, total };
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { userId, readAt: null },
  });
}
