// app/host/properties/cover-actions.ts
"use server";

import prisma from "@/lib/prisma";
import { requireHostUser } from "@/lib/auth/requireUser";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import storageProvider from "@/lib/storage";
import { generateThumbnail, getOutputMimeType } from "@/lib/media/thumbnail";
import { randomUUID } from "crypto";
import sharp from "sharp";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const BUCKET_NAME = "property-covers";

function redirectBack(returnTo: string | null) {
  if (returnTo && returnTo.startsWith("/host/properties")) {
    redirect(returnTo);
  }
  redirect("/host/properties");
}

/**
 * Upload de imagen de portada para una propiedad
 */
export async function uploadCoverImage(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  const propertyId = formData.get("propertyId")?.toString();
  const returnTo = formData.get("returnTo")?.toString() || null;
  const file = formData.get("file") as File | null;

  if (!propertyId) {
    redirectBack(returnTo);
    return;
  }

  if (!file) {
    redirectBack(returnTo);
    return;
  }

  // Validar tipo de archivo
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new Error("Tipo de archivo no permitido. Use JPG, PNG o WebP.");
  }

  // Validar tamaño
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error("El archivo es demasiado grande. Máximo 5MB.");
  }

  // Verificar que la propiedad existe y pertenece al tenant
  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      tenantId,
    },
  });

  if (!property) {
    throw new Error("Propiedad no encontrada");
  }

  // Si ya tiene una portada, eliminarla primero
  if (property.coverAssetGroupId) {
    await removeCoverImageInternal(tenantId, property.coverAssetGroupId);
  }

  // Generar groupId (UUID) para agrupar original + thumbnail
  const groupId = randomUUID();

  // Obtener metadata de la imagen original
  const originalMetadata = await sharp(buffer).metadata();
  const originalWidth = originalMetadata.width || 0;
  const originalHeight = originalMetadata.height || 0;

  // Generar thumbnail
  const thumbnailResult = await generateThumbnail(buffer, file.type);

  // Construir keys para storage
  const originalKey = `${tenantId}/${propertyId}/${groupId}/original.${file.name.split(".").pop() || "jpg"}`;
  const thumbKey = `${tenantId}/${propertyId}/${groupId}/thumb_256.${thumbnailResult.format}`;

  try {
    // Subir original
    const originalUpload = await storageProvider.putPublicObject({
      bucket: BUCKET_NAME,
      key: originalKey,
      contentType: file.type,
      buffer,
    });

    // Subir thumbnail
    const thumbUpload = await storageProvider.putPublicObject({
      bucket: BUCKET_NAME,
      key: thumbKey,
      contentType: getOutputMimeType(thumbnailResult.format),
      buffer: thumbnailResult.buffer,
    });

    // Crear registros Asset en la base de datos
    await prisma.$transaction([
      // Original
      prisma.asset.create({
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
          width: originalWidth,
          height: originalHeight,
          groupId,
        },
      }),
      // Thumbnail
      prisma.asset.create({
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
      }),
    ]);

    // Actualizar propiedad con el nuevo coverAssetGroupId
    await prisma.property.updateMany({
      where: {
        id: propertyId,
        tenantId,
      },
      data: {
        coverAssetGroupId: groupId,
      },
    });

    revalidatePath("/host/properties");
    revalidatePath(`/host/properties/${propertyId}`);
    return { ok: true as const };
  } catch (error) {
    console.error("[uploadCoverImage] Error:", error);
    // Limpiar storage si falló la creación en DB
    try {
      await storageProvider.deleteObject({ bucket: BUCKET_NAME, key: originalKey });
      await storageProvider.deleteObject({ bucket: BUCKET_NAME, key: thumbKey });
    } catch (cleanupError) {
      console.error("[uploadCoverImage] Cleanup error:", cleanupError);
    }
    throw error;
  }
}

/**
 * Elimina la portada de una propiedad
 */
export async function removeCoverImage(formData: FormData) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  const propertyId = formData.get("propertyId")?.toString();
  const returnTo = formData.get("returnTo")?.toString() || null;

  if (!propertyId) {
    redirectBack(returnTo);
    return;
  }

  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      tenantId,
    },
    select: {
      coverAssetGroupId: true,
    },
  });

  if (!property || !property.coverAssetGroupId) {
    redirectBack(returnTo);
    return;
  }

  await removeCoverImageInternal(tenantId, property.coverAssetGroupId);

  // Actualizar propiedad
  await prisma.property.updateMany({
    where: {
      id: propertyId,
      tenantId,
    },
    data: {
      coverAssetGroupId: null,
    },
  });

  revalidatePath("/host/properties");
  revalidatePath(`/host/properties/${propertyId}`);
  return { ok: true as const };
}

/**
 * Función interna para eliminar assets por groupId
 */
async function removeCoverImageInternal(tenantId: string, groupId: string) {
  // Obtener todos los assets del grupo
  const assets = await prisma.asset.findMany({
    where: {
      tenantId,
      groupId,
    },
  });

  // Eliminar del storage
  for (const asset of assets) {
    try {
      await storageProvider.deleteObject({
        bucket: asset.bucket,
        key: asset.key,
      });
    } catch (error) {
      console.warn(`[removeCoverImage] Failed to delete ${asset.key} from storage:`, error);
    }
  }

  // Eliminar registros de la base de datos
  await prisma.asset.deleteMany({
    where: {
      tenantId,
      groupId,
    },
  });
}

