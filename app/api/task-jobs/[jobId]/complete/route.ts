// app/api/task-jobs/[jobId]/complete/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import { validateJobCompletion } from "@/lib/tareas-pro/validation";
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
  if (job.status !== "IN_PROGRESS") {
    return NextResponse.json({ error: "El job no está en progreso" }, { status: 400 });
  }

  const { canComplete, blockers } = await validateJobCompletion(jobId, tenantId);
  if (!canComplete) {
    return NextResponse.json({ error: "No se puede completar", blockers }, { status: 422 });
  }

  await prisma.taskJob.update({
    where: { id: jobId },
    data: { status: "COMPLETED", completedAt: new Date() },
  });

  await logTaskEvent({ tenantId, jobId, eventType: "COMPLETED", actorId: user.id });

  return NextResponse.json({ ok: true });
}
