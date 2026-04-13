"use server";

// app/host/tareas-pro/jobs/execution-actions.ts
import prisma from "@/lib/prisma";
import { requireHostUser } from "@/lib/auth/requireUser";
import { revalidatePath } from "next/cache";
import { validateJobCompletion } from "@/lib/tareas-pro/validation";
import { logTaskEvent } from "@/lib/tareas-pro/event-log";
import storageProvider from "@/lib/storage";
import { generateThumbnail, getOutputMimeType } from "@/lib/media/thumbnail";
import { randomUUID } from "crypto";
import sharp from "sharp";

const EVIDENCE_BUCKET = "tareas-pro-job-evidence";
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

// =====================================================================
// RESPONDER PASO
// =====================================================================

export async function respondToStepAction(
  formData: FormData
): Promise<{ stepId: string }> {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const stepId = String(formData.get("stepId") || "");
  const confirmedStr = formData.get("confirmed")?.toString();
  const boolValueStr = formData.get("boolValue")?.toString();
  const numberValueStr = formData.get("numberValue")?.toString();
  const textValue = formData.get("textValue")?.toString() || null;
  const notes = formData.get("notes")?.toString() || null;

  const step = await prisma.taskJobStep.findFirst({
    where: { id: stepId, tenantId },
    include: { section: { include: { job: true } } },
  });
  if (!step) throw new Error("Paso no encontrado");

  const job = step.section.job;
  const confirmed =
    confirmedStr === "true" ? true : confirmedStr === "false" ? false : null;
  const boolValue =
    boolValueStr === "true" ? true : boolValueStr === "false" ? false : null;
  const numberValue =
    numberValueStr && numberValueStr !== "" ? parseFloat(numberValueStr) : null;

  await prisma.$transaction(async (tx) => {
    await tx.taskJobStepResponse.upsert({
      where: { stepId },
      create: {
        tenantId,
        stepId,
        respondedAt: new Date(),
        confirmed,
        boolValue,
        numberValue,
        textValue,
        notes,
      },
      update: {
        respondedAt: new Date(),
        confirmed,
        boolValue,
        numberValue,
        textValue,
        notes,
      },
    });

    await tx.taskJobStep.update({
      where: { id: stepId },
      data: { status: "RESPONDED" },
    });

    if (job.status === "PENDING") {
      await tx.taskJob.update({
        where: { id: job.id },
        data: { status: "IN_PROGRESS", startedAt: new Date() },
      });
    }
  });

  await logTaskEvent({
    tenantId,
    jobId: job.id,
    eventType: "STEP_RESPONDED",
    actorId: user.id,
    metadata: { stepId, stepName: step.nameSnapshot },
  }).catch(() => {});

  revalidatePath(`/host/tareas-pro/jobs/${job.id}`);
  return { stepId };
}

// =====================================================================
// COMPLETAR JOB
// =====================================================================

export async function completeJobAction(formData: FormData): Promise<void> {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const jobId = String(formData.get("jobId") || "");
  const job = await prisma.taskJob.findFirst({ where: { id: jobId, tenantId } });
  if (!job) throw new Error("Tarea no encontrada");
  if (job.status === "COMPLETED") return;

  const validation = await validateJobCompletion(jobId, tenantId);
  if (!validation.canComplete) {
    throw new Error(validation.blockers[0] || "No se puede finalizar aún");
  }

  await prisma.taskJob.update({
    where: { id: jobId },
    data: { status: "COMPLETED", completedAt: new Date() },
  });

  await logTaskEvent({
    tenantId,
    jobId,
    eventType: "COMPLETED",
    actorId: user.id,
  }).catch(() => {});

  revalidatePath(`/host/tareas-pro/jobs/${jobId}`);
  revalidatePath("/host/tareas-pro/jobs");
}

// =====================================================================
// ADMINISTRACIÓN — HERRAMIENTAS PARA JOBS LEGACY
// =====================================================================

/**
 * FASE 5 — Forzar cierre de un job, bypassing validación.
 * Solo para uso administrativo: jobs legacy con pasos inaccesibles.
 * Deja registro en el event log con la razón.
 */
export async function forceCompleteJobAction(formData: FormData): Promise<void> {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const jobId = String(formData.get("jobId") || "");
  const reason = String(formData.get("reason") || "Cierre forzado por administrador (job legacy)");

  const job = await prisma.taskJob.findFirst({ where: { id: jobId, tenantId } });
  if (!job) throw new Error("Tarea no encontrada");
  if (job.status === "COMPLETED") return;

  await prisma.taskJob.update({
    where: { id: jobId },
    data: { status: "COMPLETED", completedAt: new Date() },
  });

  await logTaskEvent({
    tenantId,
    jobId,
    eventType: "FORCE_COMPLETED",
    actorId: user.id,
    metadata: { forced: true, reason },
  }).catch(() => {});

  revalidatePath(`/host/tareas-pro/jobs/${jobId}`);
  revalidatePath("/host/tareas-pro/jobs");
}

/**
 * FASE 5 — Marcar un paso como confirmado (confirmed=true) sin requerir capturas específicas.
 * Para resolver steps legacy que bloquean el cierre del job.
 */
export async function resolveStepAction(formData: FormData): Promise<{ stepId: string }> {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const stepId = String(formData.get("stepId") || "");
  const notes = formData.get("notes")?.toString() || "Marcado manualmente (paso legacy)";

  const step = await prisma.taskJobStep.findFirst({
    where: { id: stepId, tenantId },
    include: { section: { include: { job: true } } },
  });
  if (!step) throw new Error("Paso no encontrado");

  const job = step.section.job;

  await prisma.$transaction(async (tx) => {
    await tx.taskJobStepResponse.upsert({
      where: { stepId },
      create: {
        tenantId,
        stepId,
        respondedAt: new Date(),
        confirmed: true,
        notes,
      },
      update: {
        respondedAt: new Date(),
        confirmed: true,
        notes,
      },
    });
    await tx.taskJobStep.update({
      where: { id: stepId },
      data: { status: "RESPONDED" },
    });
    if (job.status === "PENDING") {
      await tx.taskJob.update({
        where: { id: job.id },
        data: { status: "IN_PROGRESS", startedAt: new Date() },
      });
    }
  });

  await logTaskEvent({
    tenantId,
    jobId: job.id,
    eventType: "STEP_RESOLVED_LEGACY",
    actorId: user.id,
    metadata: { stepId, jobId: job.id, actorId: user.id, source: "legacy_resolution" },
  }).catch(() => {});

  revalidatePath(`/host/tareas-pro/jobs/${job.id}`);
  return { stepId };
}

// =====================================================================
// EVIDENCIA FOTOGRÁFICA DEL PASO
// =====================================================================

export async function uploadStepEvidenceAction(
  formData: FormData
): Promise<{ evidenceAssetId: string; thumbUrl: string }> {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const stepId = formData.get("stepId")?.toString();
  const file = formData.get("file") as File | null;
  if (!stepId) throw new Error("stepId es requerido");
  if (!file) throw new Error("file es requerido");
  if (!ALLOWED_MIME_TYPES.includes(file.type))
    throw new Error("Tipo de archivo no permitido. Use JPG, PNG o WebP.");

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.length > MAX_FILE_SIZE)
    throw new Error("El archivo es demasiado grande. Máximo 5MB.");

  const step = await prisma.taskJobStep.findFirst({
    where: { id: stepId, tenantId },
    include: { section: { select: { job: { select: { id: true } } } } },
  });
  if (!step) throw new Error("Paso no encontrado");

  const jobId = step.section.job.id;
  const groupId = randomUUID();
  const originalMetadata = await sharp(buffer).metadata();
  const thumbnailResult = await generateThumbnail(buffer, file.type);

  const fileExt = file.name.split(".").pop() || "jpg";
  const originalKey = `${tenantId}/jobs/${jobId}/steps/${stepId}/${groupId}/original.${fileExt}`;
  const thumbKey = `${tenantId}/jobs/${jobId}/steps/${stepId}/${groupId}/thumb_256.${thumbnailResult.format}`;

  try {
    const [originalUpload, thumbUpload] = await Promise.all([
      storageProvider.putPublicObject({
        bucket: EVIDENCE_BUCKET,
        key: originalKey,
        contentType: file.type,
        buffer,
      }),
      storageProvider.putPublicObject({
        bucket: EVIDENCE_BUCKET,
        key: thumbKey,
        contentType: getOutputMimeType(thumbnailResult.format),
        buffer: thumbnailResult.buffer,
      }),
    ]);

    const result = await prisma.$transaction(async (tx) => {
      await tx.asset.create({
        data: {
          tenantId,
          type: "IMAGE",
          provider: "SUPABASE",
          variant: "ORIGINAL",
          bucket: EVIDENCE_BUCKET,
          key: originalKey,
          publicUrl: originalUpload.publicUrl,
          mimeType: file.type,
          sizeBytes: buffer.length,
          width: originalMetadata.width || 0,
          height: originalMetadata.height || 0,
          groupId,
        },
      });

      const thumbAsset = await tx.asset.create({
        data: {
          tenantId,
          type: "IMAGE",
          provider: "SUPABASE",
          variant: "THUMB_256",
          bucket: EVIDENCE_BUCKET,
          key: thumbKey,
          publicUrl: thumbUpload.publicUrl,
          mimeType: getOutputMimeType(thumbnailResult.format),
          sizeBytes: thumbnailResult.buffer.length,
          width: thumbnailResult.width,
          height: thumbnailResult.height,
          groupId,
        },
      });

      const existingCount = await tx.taskJobStepEvidenceAsset.count({
        where: { stepId },
      });

      const ea = await tx.taskJobStepEvidenceAsset.create({
        data: {
          tenantId,
          stepId,
          assetId: thumbAsset.id,
          syncStatus: "UPLOADED",
          order: existingCount + 1,
        },
      });

      return { evidenceAssetId: ea.id, thumbUrl: thumbUpload.publicUrl };
    });

    revalidatePath(`/host/tareas-pro/jobs/${jobId}`);
    return result;
  } catch (error) {
    try {
      await storageProvider.deleteObject({ bucket: EVIDENCE_BUCKET, key: originalKey });
      await storageProvider.deleteObject({ bucket: EVIDENCE_BUCKET, key: thumbKey });
    } catch {}
    throw error;
  }
}

export async function deleteStepEvidenceAction(formData: FormData): Promise<void> {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const evidenceAssetId = formData.get("evidenceAssetId")?.toString();
  if (!evidenceAssetId) throw new Error("evidenceAssetId es requerido");

  await prisma.taskJobStepEvidenceAsset.deleteMany({
    where: { id: evidenceAssetId, tenantId },
  });
}
