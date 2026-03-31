// app/host/inventory/line-image-actions.ts
// Fase 11: acciones de imágenes a nivel InventoryLine (modelo híbrido)
"use server";

import prisma from "@/lib/prisma";
import { requireHostUser } from "@/lib/auth/requireUser";
import { revalidatePath } from "next/cache";
import storageProvider from "@/lib/storage";
import { generateThumbnail, getOutputMimeType } from "@/lib/media/thumbnail";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { getInventoryLineImageThumbs } from "@/lib/media/getInventoryLineImageThumbs";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const BUCKET_NAME = "inventory-item-images"; // mismo bucket que items, sin migrar storage

/**
 * Obtiene los thumbnails de una InventoryLine (con fallback al InventoryItem).
 * Para uso desde client components.
 */
export async function getInventoryLineImageThumbsAction(
  lineId: string
): Promise<Array<string | null>> {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  const line = await prisma.inventoryLine.findFirst({
    where: { id: lineId, tenantId },
    select: { id: true, itemId: true },
  });

  if (!line) throw new Error("InventoryLine no encontrada o no pertenece a tu cuenta");

  return getInventoryLineImageThumbs(line.id, line.itemId);
}

/**
 * Sube una imagen para una InventoryLine en una posición específica (1-3).
 * Crea un Asset original + THUMB_256 y registra InventoryLineAsset.
 * NO toca InventoryItemAsset ni la imagen compartida del catálogo.
 */
export async function uploadInventoryLineImageAction(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  const lineId = formData.get("lineId")?.toString();
  const positionStr = formData.get("position")?.toString();
  const file = formData.get("file") as File | null;

  if (!lineId) throw new Error("lineId es requerido");
  if (!positionStr) throw new Error("position es requerido");

  const position = parseInt(positionStr, 10);
  if (isNaN(position) || position < 1 || position > 3) {
    throw new Error("position debe ser 1, 2 o 3");
  }
  if (!file) throw new Error("file es requerido");
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new Error("Tipo de archivo no permitido. Use JPG, PNG o WebP.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error("El archivo es demasiado grande. Máximo 5MB.");
  }

  const line = await prisma.inventoryLine.findFirst({
    where: { id: lineId, tenantId },
    select: { id: true, propertyId: true },
  });
  if (!line) throw new Error("InventoryLine no encontrada o no pertenece a tu cuenta");

  const groupId = randomUUID();
  const originalMetadata = await sharp(buffer).metadata();
  const thumbnailResult = await generateThumbnail(buffer, file.type);

  const fileExtension = file.name.split(".").pop() || "jpg";
  const originalKey = `${tenantId}/inventory-lines/${lineId}/${groupId}/original.${fileExtension}`;
  const thumbKey = `${tenantId}/inventory-lines/${lineId}/${groupId}/thumb_256.${thumbnailResult.format}`;

  try {
    const [originalUpload, thumbUpload] = await Promise.all([
      storageProvider.putPublicObject({
        bucket: BUCKET_NAME,
        key: originalKey,
        contentType: file.type,
        buffer,
      }),
      storageProvider.putPublicObject({
        bucket: BUCKET_NAME,
        key: thumbKey,
        contentType: getOutputMimeType(thumbnailResult.format),
        buffer: thumbnailResult.buffer,
      }),
    ]);

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

      await tx.inventoryLineAsset.upsert({
        where: {
          tenantId_lineId_position: { tenantId, lineId, position },
        },
        create: { tenantId, lineId, assetId: thumbAsset.id, position },
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

    revalidatePath("/host/properties");
    return result;
  } catch (error) {
    // Cleanup storage si falló la DB
    await Promise.allSettled([
      storageProvider.deleteObject({ bucket: BUCKET_NAME, key: originalKey }),
      storageProvider.deleteObject({ bucket: BUCKET_NAME, key: thumbKey }),
    ]);
    throw error;
  }
}

/**
 * Elimina la imagen de una InventoryLine en una posición específica.
 * Solo desvinccula InventoryLineAsset; los Assets quedan por ahora (consistente con comportamiento de items).
 * NO toca InventoryItemAsset ni las imágenes de otras líneas.
 */
export async function deleteInventoryLineImageAction(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  const lineId = formData.get("lineId")?.toString();
  const positionStr = formData.get("position")?.toString();

  if (!lineId) throw new Error("lineId es requerido");
  if (!positionStr) throw new Error("position es requerido");

  const position = parseInt(positionStr, 10);
  if (isNaN(position) || position < 1 || position > 3) {
    throw new Error("position debe ser 1, 2 o 3");
  }

  const line = await prisma.inventoryLine.findFirst({
    where: { id: lineId, tenantId },
    select: { id: true },
  });
  if (!line) throw new Error("InventoryLine no encontrada o no pertenece a tu cuenta");

  await prisma.inventoryLineAsset.deleteMany({
    where: { tenantId, lineId, position },
  });

  revalidatePath("/host/properties");
}
