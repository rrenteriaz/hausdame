// app/api/task-jobs/[jobId]/steps/[stepId]/evidence/route.ts
// POST: Registrar evidencia fotográfica de un paso
// El cliente sube primero el archivo a /api/media/upload, luego llama aquí con el assetId
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string; stepId: string }> }
) {
  const user = await getCurrentUser();
  if (!user || !user.tenantId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { stepId } = await params;
  const tenantId = user.tenantId;

  const body = await req.json();
  const { assetId, caption } = body;

  if (!assetId) {
    return NextResponse.json({ error: "assetId requerido" }, { status: 400 });
  }

  const step = await prisma.taskJobStep.findFirst({
    where: { id: stepId, tenantId },
  });
  if (!step) return NextResponse.json({ error: "Paso no encontrado" }, { status: 404 });

  const evidence = await prisma.taskJobStepEvidenceAsset.create({
    data: {
      tenantId,
      stepId,
      assetId,
      syncStatus: "UPLOADED",
      caption: caption ?? null,
      order: 0,
    },
  });

  return NextResponse.json({ evidence }, { status: 201 });
}

// DELETE: Eliminar una evidencia
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string; stepId: string }> }
) {
  const user = await getCurrentUser();
  if (!user || !user.tenantId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const tenantId = user.tenantId;
  const body = await req.json();
  const { evidenceId } = body;

  if (!evidenceId) {
    return NextResponse.json({ error: "evidenceId requerido" }, { status: 400 });
  }

  await prisma.taskJobStepEvidenceAsset.deleteMany({
    where: { id: evidenceId, tenantId },
  });

  return NextResponse.json({ ok: true });
}
