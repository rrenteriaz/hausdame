"use server";

// app/cleaner/tareas-pro/actions.ts
import prisma from "@/lib/prisma";
import { requireUser } from "@/lib/auth/requireUser";
import { revalidatePath } from "next/cache";
import { validateJobCompletion } from "@/lib/tareas-pro/validation";
import { logTaskEvent } from "@/lib/tareas-pro/event-log";
import { createCarryForwardFromSection } from "@/lib/tareas-pro/carry-forward";
import storageProvider from "@/lib/storage";
import { generateThumbnail, getOutputMimeType } from "@/lib/media/thumbnail";
import { randomUUID } from "crypto";
import sharp from "sharp";

const EVIDENCE_BUCKET = "tareas-pro-job-evidence";
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

// =====================================================================
// INICIAR JOB
// =====================================================================

export async function startTaskJob(formData: FormData) {
  const user = await requireUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const jobId = String(formData.get("jobId") || "");

  const job = await prisma.taskJob.findFirst({
    where: { id: jobId, tenantId },
  });
  if (!job) throw new Error("Job no encontrado");
  if (job.status !== "PENDING") throw new Error("Job ya está en progreso o finalizado");

  await prisma.taskJob.update({
    where: { id: jobId },
    data: { status: "IN_PROGRESS", startedAt: new Date() },
  });

  await logTaskEvent({
    tenantId,
    jobId,
    eventType: "STARTED",
    actorId: user.id,
  });

  revalidatePath(`/cleaner/tareas-pro/${jobId}`);
}

// =====================================================================
// RESPONDER PASO
// =====================================================================

export async function respondTaskStep(formData: FormData) {
  const user = await requireUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const stepId = String(formData.get("stepId") || "");
  const jobId = String(formData.get("jobId") || "");
  const confirmed = formData.get("confirmed") === "true" ? true : formData.get("confirmed") === "false" ? false : null;
  const boolValue = formData.get("boolValue") === "true" ? true : formData.get("boolValue") === "false" ? false : null;
  const numberValueRaw = formData.get("numberValue");
  const numberValue = numberValueRaw ? parseFloat(String(numberValueRaw)) : null;
  const textValue = String(formData.get("textValue") || "") || null;
  const notes = String(formData.get("notes") || "") || null;

  const step = await prisma.taskJobStep.findFirst({
    where: { id: stepId, tenantId },
    include: { section: true },
  });
  if (!step) throw new Error("Paso no encontrado");

  // Verificar que el job pertenece al tenant
  const job = await prisma.taskJob.findFirst({
    where: { id: jobId, tenantId },
  });
  if (!job) throw new Error("Job no encontrado");

  await prisma.taskJobStepResponse.upsert({
    where: { stepId },
    create: {
      tenantId,
      stepId,
      respondedAt: new Date(),
      confirmed,
      boolValue,
      numberValue: numberValue !== null ? numberValue : undefined,
      textValue,
      notes,
    },
    update: {
      respondedAt: new Date(),
      confirmed,
      boolValue,
      numberValue: numberValue !== null ? numberValue : undefined,
      textValue,
      notes,
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
    metadata: { stepId, stepName: step.nameSnapshot },
  });

  revalidatePath(`/cleaner/tareas-pro/${jobId}`);
}

// =====================================================================
// CONFIRMAR SECCIÓN
// =====================================================================

export async function confirmTaskSection(formData: FormData) {
  const user = await requireUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const sectionId = String(formData.get("sectionId") || "");
  const jobId = String(formData.get("jobId") || "");
  const notes = String(formData.get("notes") || "") || null;

  const section = await prisma.taskJobSection.findFirst({
    where: { id: sectionId, tenantId },
  });
  if (!section) throw new Error("Sección no encontrada");

  await prisma.taskJobSectionResponse.upsert({
    where: { sectionId },
    create: {
      tenantId,
      sectionId,
      confirmedAt: new Date(),
      notes,
    },
    update: {
      confirmedAt: new Date(),
      notes,
    },
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

  revalidatePath(`/cleaner/tareas-pro/${jobId}`);
}

// =====================================================================
// MARCAR SECCIÓN COMO DEFERRED
// =====================================================================

export async function deferTaskSection(formData: FormData) {
  const user = await requireUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const sectionId = String(formData.get("sectionId") || "");
  const jobId = String(formData.get("jobId") || "");
  const reason = String(formData.get("reason") || "").trim() || null;

  const section = await prisma.taskJobSection.findFirst({
    where: { id: sectionId, tenantId },
  });
  if (!section) throw new Error("Sección no encontrada");

  const job = await prisma.taskJob.findFirst({
    where: { id: jobId, tenantId },
  });
  if (!job) throw new Error("Job no encontrado");

  await prisma.taskJobSection.update({
    where: { id: sectionId },
    data: { status: "DEFERRED" },
  });

  // Obtener configuración de carry-forward del template
  const schedule = await prisma.taskTemplateSchedule.findUnique({
    where: { templateId: job.templateId },
  });

  await createCarryForwardFromSection(
    tenantId,
    job.propertyId,
    jobId,
    sectionId,
    reason,
    schedule?.carryForwardPolicy ?? "LIMITED",
    schedule?.maxCarryForwardAttempts ?? 2
  );

  await logTaskEvent({
    tenantId,
    jobId,
    eventType: "DEFERRED",
    actorId: user.id,
    metadata: { sectionId, sectionName: section.nameSnapshot, reason },
  });

  revalidatePath(`/cleaner/tareas-pro/${jobId}`);
}

// =====================================================================
// MARCAR JOB COMPLETO (CIERRE ESTRICTO)
// =====================================================================

export async function completeTaskJob(formData: FormData) {
  const user = await requireUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const jobId = String(formData.get("jobId") || "");

  const job = await prisma.taskJob.findFirst({
    where: { id: jobId, tenantId },
  });
  if (!job) throw new Error("Job no encontrado");
  if (job.status !== "IN_PROGRESS") throw new Error("El job no está en progreso");

  // Validación estricta de cierre
  const { canComplete, blockers } = await validateJobCompletion(jobId, tenantId);
  if (!canComplete) {
    throw new Error(`No se puede completar el job:\n${blockers.join("\n")}`);
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
  });

  revalidatePath(`/cleaner/tareas-pro/${jobId}`);
  revalidatePath("/cleaner/tareas-pro");
}

// =====================================================================
// REGISTRAR EVIDENCIA (assetId luego de upload externo)
// =====================================================================

export async function attachStepEvidence(formData: FormData) {
  const user = await requireUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const stepId = String(formData.get("stepId") || "");
  const assetId = String(formData.get("assetId") || "");
  const caption = String(formData.get("caption") || "") || null;

  const step = await prisma.taskJobStep.findFirst({
    where: { id: stepId, tenantId },
  });
  if (!step) throw new Error("Paso no encontrado");

  await prisma.taskJobStepEvidenceAsset.create({
    data: {
      tenantId,
      stepId,
      assetId,
      syncStatus: "UPLOADED",
      caption,
      order: 0,
    },
  });

  revalidatePath(`/cleaner/tareas-pro`);
}

export async function markEvidenceSyncStatus(formData: FormData) {
  const user = await requireUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const evidenceId = String(formData.get("evidenceId") || "");
  const syncStatus = String(formData.get("syncStatus") || "") as any;
  const assetId = String(formData.get("assetId") || "") || null;

  await prisma.taskJobStepEvidenceAsset.updateMany({
    where: { id: evidenceId, tenantId },
    data: { syncStatus, assetId: assetId ?? undefined },
  });
}

// =====================================================================
// EVIDENCIA FOTOGRÁFICA DEL PASO
// =====================================================================

export async function uploadStepEvidenceAction(
  formData: FormData
): Promise<{ evidenceAssetId: string; thumbUrl: string }> {
  const user = await requireUser();
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

    revalidatePath(`/cleaner/tareas-pro/${jobId}`);
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
  const user = await requireUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const evidenceAssetId = formData.get("evidenceAssetId")?.toString();
  if (!evidenceAssetId) throw new Error("evidenceAssetId es requerido");

  await prisma.taskJobStepEvidenceAsset.deleteMany({
    where: { id: evidenceAssetId, tenantId },
  });
}
