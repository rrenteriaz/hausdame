// app/api/task-jobs/[jobId]/steps/[stepId]/respond/route.ts
// POST: Enviar respuesta a un paso (incremental, offline-friendly)
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import { logTaskEvent } from "@/lib/tareas-pro/event-log";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string; stepId: string }> }
) {
  const user = await getCurrentUser();
  if (!user || !user.tenantId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { jobId, stepId } = await params;
  const tenantId = user.tenantId;

  const body = await req.json();
  const { confirmed, boolValue, numberValue, textValue, notes } = body;

  const step = await prisma.taskJobStep.findFirst({
    where: { id: stepId, tenantId },
  });
  if (!step) return NextResponse.json({ error: "Paso no encontrado" }, { status: 404 });

  await prisma.taskJobStepResponse.upsert({
    where: { stepId },
    create: {
      tenantId,
      stepId,
      respondedAt: new Date(),
      confirmed: confirmed ?? null,
      boolValue: boolValue ?? null,
      numberValue: numberValue != null ? numberValue : undefined,
      textValue: textValue ?? null,
      notes: notes ?? null,
    },
    update: {
      respondedAt: new Date(),
      confirmed: confirmed ?? null,
      boolValue: boolValue ?? null,
      numberValue: numberValue != null ? numberValue : undefined,
      textValue: textValue ?? null,
      notes: notes ?? null,
    },
  });

  await prisma.taskJobStep.update({
    where: { id: stepId },
    data: { status: "RESPONDED" },
  });

  await logTaskEvent({
    tenantId,
    jobId,
    eventType: "STEP_RESPONDED",
    actorId: user.id,
    metadata: { stepId },
  });

  return NextResponse.json({ ok: true });
}
