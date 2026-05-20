// lib/notifications/getNotifications.ts
import prisma from "@/lib/prisma";
import type { NotificationType } from "@/lib/generated/prisma";

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

let notificationTableCheck:
  | { checkedAt: number; available: boolean }
  | null = null;

function isMissingTableError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2021"
  );
}

async function isNotificationTableAvailable() {
  const now = Date.now();
  if (notificationTableCheck && now - notificationTableCheck.checkedAt < 30_000) {
    return notificationTableCheck.available;
  }

  const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'Notification'
    ) AS "exists"
  `;

  const available = result[0]?.exists === true;
  notificationTableCheck = { checkedAt: now, available };
  return available;
}

export async function getNotificationsForUser(
  userId: string,
  opts: { unreadOnly?: boolean; limit?: number; offset?: number } = {}
): Promise<GetNotificationsResult> {
  const { unreadOnly = false, limit = 30, offset = 0 } = opts;

  if (!(await isNotificationTableAvailable())) {
    return { notifications: [], total: 0 };
  }

  const where = {
    userId,
    ...(unreadOnly ? { readAt: null } : {}),
  };

  try {
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
  } catch (error) {
    if (isMissingTableError(error)) {
      return { notifications: [], total: 0 };
    }
    throw error;
  }
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  if (!(await isNotificationTableAvailable())) {
    return 0;
  }

  try {
    return await prisma.notification.count({
      where: { userId, readAt: null },
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      return 0;
    }
    throw error;
  }
}
