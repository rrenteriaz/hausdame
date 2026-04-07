// app/api/task-jobs/[jobId]/sections/[sectionId]/confirm/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import { logTaskEvent } from "@/lib/tareas-pro/event-log";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string; sectionId: string }> }
) {
  const user = await getCurrentUser();
  if (!user || !user.tenantId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { jobId, sectionId } = await params;
  const tenantId = user.tenantId;

  const body = await req.json().catch(() => ({}));
  const { notes } = body;

  const section = await prisma.taskJobSection.findFirst({
    where: { id: sectionId, tenantId },
  });
  if (!section) return NextResponse.json({ error: "Sección no encontrada" }, { status: 404 });

  await prisma.taskJobSectionResponse.upsert({
    where: { sectionId },
    create: { tenantId, sectionId, confirmedAt: new Date(), notes: notes ?? null },
    update: { confirmedAt: new Date(), notes: notes ?? null },
  });

  await prisma.taskJobSection.update({
    where: { id: sectionId },
    data: { status: "CONFIRMED" },
  });

  await logTaskEvent({
    tenantId,
    jobId,
    eventType: "SECTION_CONFIRMED",
    actorId: user.id,
    metadata: { sectionId, sectionName: section.nameSnapshot },
  });

  return NextResponse.json({ ok: true });
}
