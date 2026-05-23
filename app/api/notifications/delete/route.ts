// app/api/notifications/delete/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { deleteNotification } from "@/lib/notifications/deleteNotification";

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

  const { id } = body as { id?: string };
  if (!id) {
    return NextResponse.json({ error: "id requerido" }, { status: 400 });
  }

  const ok = await deleteNotification(id, userId);
  return NextResponse.json({ ok });
}
