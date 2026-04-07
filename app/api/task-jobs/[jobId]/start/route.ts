// app/api/task-jobs/[jobId]/start/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import { logTaskEvent } from "@/lib/tareas-pro/event-log";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const user = await getCurrentUser();
  if (!user || !user.tenantId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { jobId } = await params;
  const tenantId = user.tenantId;

  const job = await prisma.taskJob.findFirst({ where: { id: jobId, tenantId } });
  if (!job) return NextResponse.json({ error: "Job no encontrado" }, { status: 404 });
  if (job.status !== "PENDING") {
    return NextResponse.json({ error: "Job ya iniciado o finalizado" }, { status: 400 });
  }

  await prisma.taskJob.update({
    where: { id: jobId },
    data: { status: "IN_PROGRESS", startedAt: new Date() },
  });

  await logTaskEvent({ tenantId, jobId, eventType: "STARTED", actorId: user.id });

  return NextResponse.json({ ok: true });
}
