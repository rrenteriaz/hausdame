// app/api/push/subscribe/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth/session";

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

  const { endpoint, keys } = body as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
  }

  const userAgent = req.headers.get("user-agent") ?? undefined;

  // Buscar tenant del usuario para asociar la suscripción
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tenantId: true },
  });

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      userId,
      tenantId: user?.tenantId ?? null,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent,
      revokedAt: null,
    },
    update: {
      userId,
      tenantId: user?.tenantId ?? null,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent,
      revokedAt: null,
      updatedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
