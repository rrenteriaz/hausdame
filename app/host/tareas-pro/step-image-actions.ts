// app/host/tareas-pro/step-image-actions.ts
"use server";

import prisma from "@/lib/prisma";
import { requireHostUser } from "@/lib/auth/requireUser";
import { revalidatePath } from "next/cache";
import storageProvider from "@/lib/storage";
import { generateThumbnail, getOutputMimeType } from "@/lib/media/thumbnail";
import { getTaskStepImageThumbs } from "@/lib/media/getTaskStepImageThumbs";
import { randomUUID } from "crypto";
import sharp from "sharp";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const BUCKET_NAME = "tareas-pro-step-images";

/**
 * Upload de imagen de referencia para un TaskStepTemplate (posición 1-3)
 */
export async function uploadTaskStepImageAction(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  const stepId = formData.get("stepId")?.toString();
  const positionStr = formData.get("position")?.toString();
  const file = formData.get("file") as File | null;

  if (!stepId) throw new Error("stepId es requerido");
  if (!positionStr) throw new Error("position es requerido");

  const position = parseInt(positionStr, 10);
  if (isNaN(position) || position < 1 || position > 3) throw new Error("position debe ser 1, 2 o 3");
  if (!file) throw new Error("file es requerido");
  if (!ALLOWED_MIME_TYPES.includes(file.type)) throw new Error("Tipo de archivo no permitido. Use JPG, PNG o WebP.");

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.length > MAX_FILE_SIZE) throw new Error("El archivo es demasiado grande. Máximo 5MB.");

  // Verificar que el step existe y pertenece al tenant
  const step = await prisma.taskStepTemplate.findFirst({
    where: { id: stepId, tenantId },
    include: { section: { include: { template: { select: { id: true, propertyId: true } } } } },
  });
  if (!step) throw new Error("Tarea no encontrada o no pertenece a tu cuenta");

  const templateId = step.section.templateId;

  const groupId = randomUUID();
  const originalMetadata = await sharp(buffer).metadata();
  const thumbnailResult = await generateThumbnail(buffer, file.type);

  const fileExtension = file.name.split(".").pop() || "jpg";
  const originalKey = `${tenantId}/steps/${stepId}/${groupId}/original.${fileExtension}`;
  const thumbKey = `${tenantId}/steps/${stepId}/${groupId}/thumb_256.${thumbnailResult.format}`;

  try {
    const originalUpload = await storageProvider.putPublicObject({
      bucket: BUCKET_NAME,
      key: originalKey,
      contentType: file.type,
      buffer,
    });

    const thumbUpload = await storageProvider.putPublicObject({
      bucket: BUCKET_NAME,
      key: thumbKey,
      contentType: getOutputMimeType(thumbnailResult.format),
      buffer: thumbnailResult.buffer,
    });

    const result = await prisma.$transaction(async (tx) => {
      const originalAsset = await tx.asset.create({
        data: {
          tenantId,
          type: "IMAGE",
          provider: "SUPABASE",
          variant: "ORIGINAL",
          bucket: BUCKET_NAME,
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
          bucket: BUCKET_NAME,
          key: thumbKey,
          publicUrl: thumbUpload.publicUrl,
          mimeType: getOutputMimeType(thumbnailResult.format),
          sizeBytes: thumbnailResult.buffer.length,
          width: thumbnailResult.width,
          height: thumbnailResult.height,
          groupId,
        },
      });

      // Upsert: si ya existe imagen en esa posición (order), reemplazarla
      await tx.taskStepReferenceAsset.upsert({
        where: { tenantId_stepId_order: { tenantId, stepId, order: position } },
        create: { tenantId, stepId, assetId: thumbAsset.id, order: position },
        update: { assetId: thumbAsset.id },
      });

      return {
        position,
        groupId,
        thumbUrl: thumbUpload.publicUrl,
        originalUrl: originalUpload.publicUrl,
        assetIds: [originalAsset.id, thumbAsset.id],
      };
    });

    revalidatePath(`/host/tareas-pro/${templateId}`);
    return result;
  } catch (error) {
    try {
      await storageProvider.deleteObject({ bucket: BUCKET_NAME, key: originalKey });
      await storageProvider.deleteObject({ bucket: BUCKET_NAME, key: thumbKey });
    } catch {}
    throw error;
  }
}

/**
 * Elimina la imagen de un TaskStepTemplate en una posición específica
 */
export async function deleteTaskStepImageAction(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  const stepId = formData.get("stepId")?.toString();
  const positionStr = formData.get("position")?.toString();

  if (!stepId) throw new Error("stepId es requerido");
  if (!positionStr) throw new Error("position es requerido");

  const position = parseInt(positionStr, 10);
  if (isNaN(position) || position < 1 || position > 3) throw new Error("position debe ser 1, 2 o 3");

  const step = await prisma.taskStepTemplate.findFirst({
    where: { id: stepId, tenantId },
    include: { section: true },
  });
  if (!step) throw new Error("Tarea no encontrada o no pertenece a tu cuenta");

  await prisma.taskStepReferenceAsset.deleteMany({
    where: { tenantId, stepId, order: position },
  });

  revalidatePath(`/host/tareas-pro/${step.section.templateId}`);
}

/**
 * Obtiene thumbnails de un TaskStepTemplate (para lazy-load en modal de fotos)
 */
export async function getTaskStepThumbsAction(stepId: string): Promise<Array<string | null>> {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant");

  const step = await prisma.taskStepTemplate.findFirst({
    where: { id: stepId, tenantId },
    select: { id: true },
  });
  if (!step) throw new Error("Tarea no encontrada");

  return getTaskStepImageThumbs(stepId);
}
