// app/api/notifications/read/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import {
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "@/lib/notifications/markNotificationRead";

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { id, all } = body as { id?: string; all?: boolean };

  if (all) {
    const count = await markAllNotificationsAsRead(userId);
    return NextResponse.json({ ok: true, count });
  }

  if (!id) {
    return NextResponse.json({ error: "id o all requerido" }, { status: 400 });
  }

  const ok = await markNotificationAsRead(id, userId);
  return NextResponse.json({ ok });
}
