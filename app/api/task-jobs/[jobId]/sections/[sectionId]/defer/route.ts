// app/api/task-jobs/[jobId]/sections/[sectionId]/defer/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import { createCarryForwardFromSection } from "@/lib/tareas-pro/carry-forward";
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
  const { reason } = body;

  const section = await prisma.taskJobSection.findFirst({
    where: { id: sectionId, tenantId },
  });
  if (!section) return NextResponse.json({ error: "Sección no encontrada" }, { status: 404 });

  const job = await prisma.taskJob.findFirst({ where: { id: jobId, tenantId } });
  if (!job) return NextResponse.json({ error: "Job no encontrado" }, { status: 404 });

  await prisma.taskJobSection.update({
    where: { id: sectionId },
    data: { status: "DEFERRED" },
  });

  const schedule = await prisma.taskTemplateSchedule.findUnique({
    where: { templateId: job.templateId },
  });

  await createCarryForwardFromSection(
    tenantId,
    job.propertyId,
    jobId,
    sectionId,
    reason ?? null,
    schedule?.carryForwardPolicy ?? "LIMITED",
    schedule?.maxCarryForwardAttempts ?? 2
  );

  await logTaskEvent({
    tenantId,
    jobId,
    eventType: "DEFERRED",
    actorId: user.id,
    metadata: { sectionId, reason },
  });

  return NextResponse.json({ ok: true });
}
