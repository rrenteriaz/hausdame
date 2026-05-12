// app/api/notifications/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import {
  getNotificationsForUser,
  getUnreadNotificationCount,
} from "@/lib/notifications/getNotifications";

export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const unreadOnly = searchParams.get("unreadOnly") === "1";
  const limit = Math.min(Number(searchParams.get("limit") ?? "30"), 100);
  const offset = Math.max(Number(searchParams.get("offset") ?? "0"), 0);
  const countOnly = searchParams.get("count") === "1";

  if (countOnly) {
    const count = await getUnreadNotificationCount(userId);
    return NextResponse.json({ count });
  }

  const result = await getNotificationsForUser(userId, { unreadOnly, limit, offset });
  return NextResponse.json(result);
}
