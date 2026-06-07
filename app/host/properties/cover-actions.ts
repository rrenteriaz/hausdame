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

function logError(step: string, error: unknown) {
  const e = error as any;
  console.error(`[cover-upload] FAIL at ${step}:`, {
    name: e?.name,
    message: e?.message,
    cause: e?.cause,
    stack: e?.stack?.split("\n").slice(0, 6).join("\n"),
  });
}

export async function uploadCoverImage(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  let user: Awaited<ReturnType<typeof requireHostUser>>;
  try {
    user = await requireHostUser();
  } catch (error) {
    logError("requireHostUser", error);
    return { ok: false, error: "No autorizado." };
  }

  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "Usuario sin tenant asociado." };

  const propertyId = formData.get("propertyId")?.toString();
  const returnTo = formData.get("returnTo")?.toString() || null;
  const file = formData.get("file") as File | null;

  if (!propertyId) { redirectBack(returnTo); return { ok: false, error: "propertyId requerido." }; }
  if (!file) { redirectBack(returnTo); return { ok: false, error: "Archivo requerido." }; }

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { ok: false, error: "Tipo de archivo no permitido. Use JPG, PNG o WebP." };
  }

  let buffer: Buffer;
  try {
    const arrayBuffer = await file.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  } catch (error) {
    logError("arrayBuffer", error);
    return { ok: false, error: "No se pudo leer el archivo." };
  }

  if (buffer.length > MAX_FILE_SIZE) {
    return { ok: false, error: "El archivo es demasiado grande. Máximo 5MB." };
  }

  // Verificar propiedad
  let property: { id: string; coverAssetGroupId: string | null } | null;
  try {
    property = await prisma.property.findFirst({
      where: { id: propertyId, tenantId },
      select: { id: true, coverAssetGroupId: true },
    });
  } catch (error) {
    logError("prisma.property.findFirst", error);
    return { ok: false, error: "Error al verificar la propiedad." };
  }

  if (!property) return { ok: false, error: "Propiedad no encontrada." };

  // Eliminar portada anterior
  if (property.coverAssetGroupId) {
    try {
      await removeCoverImageInternal(tenantId, property.coverAssetGroupId);
    } catch (error) {
      logError("removeCoverImageInternal", error);
      // No bloquear el upload por esto
    }
  }

  const groupId = randomUUID();

  // Metadata original con sharp
  let originalWidth = 0;
  let originalHeight = 0;
  try {
    console.log("[cover-upload] Running sharp metadata...");
    const originalMetadata = await sharp(buffer).metadata();
    originalWidth = originalMetadata.width || 0;
    originalHeight = originalMetadata.height || 0;
    console.log("[cover-upload] sharp metadata OK:", { originalWidth, originalHeight, format: originalMetadata.format });
  } catch (error) {
    logError("sharp.metadata", error);
    return { ok: false, error: "No se pudo procesar la imagen. Verifica que sea JPG, PNG o WebP válido." };
  }

  // Generar thumbnail
  let thumbnailResult: Awaited<ReturnType<typeof generateThumbnail>>;
  try {
    console.log("[cover-upload] Generating thumbnail...");
    thumbnailResult = await generateThumbnail(buffer, file.type);
    console.log("[cover-upload] Thumbnail OK:", { width: thumbnailResult.width, height: thumbnailResult.height, format: thumbnailResult.format });
  } catch (error) {
    logError("generateThumbnail", error);
    return { ok: false, error: "No se pudo generar el thumbnail de la imagen." };
  }

  const ext = file.name.split(".").pop() || "jpg";
  const originalKey = `${tenantId}/${propertyId}/${groupId}/original.${ext}`;
  const thumbKey = `${tenantId}/${propertyId}/${groupId}/thumb_256.${thumbnailResult.format}`;

  // Subir al storage
  let originalPublicUrl: string;
  let thumbPublicUrl: string;
  try {
    console.log("[cover-upload] Uploading original to Supabase...");
    const originalUpload = await storageProvider.putPublicObject({
      bucket: BUCKET_NAME,
      key: originalKey,
      contentType: file.type,
      buffer,
    });
    originalPublicUrl = originalUpload.publicUrl;
    console.log("[cover-upload] Original uploaded:", originalPublicUrl);

    console.log("[cover-upload] Uploading thumbnail to Supabase...");
    const thumbUpload = await storageProvider.putPublicObject({
      bucket: BUCKET_NAME,
      key: thumbKey,
      contentType: getOutputMimeType(thumbnailResult.format),
      buffer: thumbnailResult.buffer,
    });
    thumbPublicUrl = thumbUpload.publicUrl;
    console.log("[cover-upload] Thumbnail uploaded:", thumbPublicUrl);
  } catch (error) {
    logError("storageProvider.putPublicObject", error);
    // Intentar limpiar
    try { await storageProvider.deleteObject({ bucket: BUCKET_NAME, key: originalKey }); } catch {}
    try { await storageProvider.deleteObject({ bucket: BUCKET_NAME, key: thumbKey }); } catch {}
    return { ok: false, error: "No se pudo subir la imagen al storage. Revisa las credenciales de Supabase." };
  }

  // Crear Assets y actualizar Property en DB
  try {
    console.log("[cover-upload] Saving to DB...");
    await prisma.$transaction([
      prisma.asset.create({
        data: {
          tenantId,
          type: "IMAGE",
          provider: "SUPABASE",
          variant: "ORIGINAL",
          bucket: BUCKET_NAME,
          key: originalKey,
          publicUrl: originalPublicUrl,
          mimeType: file.type,
          sizeBytes: buffer.length,
          width: originalWidth,
          height: originalHeight,
          groupId,
        },
      }),
      prisma.asset.create({
        data: {
          tenantId,
          type: "IMAGE",
          provider: "SUPABASE",
          variant: "THUMB_256",
          bucket: BUCKET_NAME,
          key: thumbKey,
          publicUrl: thumbPublicUrl,
          mimeType: getOutputMimeType(thumbnailResult.format),
          sizeBytes: thumbnailResult.buffer.length,
          width: thumbnailResult.width,
          height: thumbnailResult.height,
          groupId,
        },
      }),
    ]);

    await prisma.property.updateMany({
      where: { id: propertyId, tenantId },
      data: { coverAssetGroupId: groupId },
    });
    console.log("[cover-upload] DB saved OK, groupId:", groupId);
  } catch (error) {
    logError("prisma.$transaction / updateMany", error);
    // Limpiar storage
    try { await storageProvider.deleteObject({ bucket: BUCKET_NAME, key: originalKey }); } catch {}
    try { await storageProvider.deleteObject({ bucket: BUCKET_NAME, key: thumbKey }); } catch {}
    return { ok: false, error: "Error al guardar en la base de datos." };
  }

  revalidatePath("/host/properties");
  revalidatePath(`/host/properties/${propertyId}`);
  return { ok: true };
}

export async function removeCoverImage(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  let user: Awaited<ReturnType<typeof requireHostUser>>;
  try {
    user = await requireHostUser();
  } catch (error) {
    logError("requireHostUser (remove)", error);
    return { ok: false, error: "No autorizado." };
  }

  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "Usuario sin tenant asociado." };

  const propertyId = formData.get("propertyId")?.toString();
  const returnTo = formData.get("returnTo")?.toString() || null;

  if (!propertyId) { redirectBack(returnTo); return { ok: false, error: "propertyId requerido." }; }

  let property: { coverAssetGroupId: string | null } | null;
  try {
    property = await prisma.property.findFirst({
      where: { id: propertyId, tenantId },
      select: { coverAssetGroupId: true },
    });
  } catch (error) {
    logError("prisma.property.findFirst (remove)", error);
    return { ok: false, error: "Error al verificar la propiedad." };
  }

  if (!property || !property.coverAssetGroupId) {
    redirectBack(returnTo);
    return { ok: false, error: "No hay imagen de portada." };
  }

  try {
    await removeCoverImageInternal(tenantId, property.coverAssetGroupId);
  } catch (error) {
    logError("removeCoverImageInternal (remove)", error);
    return { ok: false, error: "Error al eliminar los archivos del storage." };
  }

  try {
    await prisma.property.updateMany({
      where: { id: propertyId, tenantId },
      data: { coverAssetGroupId: null },
    });
  } catch (error) {
    logError("prisma.property.updateMany (remove)", error);
    return { ok: false, error: "Error al actualizar la propiedad en la base de datos." };
  }

  revalidatePath("/host/properties");
  revalidatePath(`/host/properties/${propertyId}`);
  return { ok: true };
}

async function removeCoverImageInternal(tenantId: string, groupId: string) {
  const assets = await prisma.asset.findMany({
    where: { tenantId, groupId },
  });

  for (const asset of assets) {
    try {
      await storageProvider.deleteObject({ bucket: asset.bucket, key: asset.key });
    } catch (error) {
      console.warn(`[cover-upload] Failed to delete ${asset.key}:`, error);
    }
  }

  await prisma.asset.deleteMany({ where: { tenantId, groupId } });
}
