// app/host/inventory-review/actions.ts
"use server";

import prisma from "@/lib/prisma";
import { requireHostUser, requireUser } from "@/lib/auth/requireUser";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createId } from "@paralleldrive/cuid2";
import storageProvider from "@/lib/storage";
import {
  InventoryReviewStatus,
  InventoryChangeReason,
  InventoryChangeStatus,
  InventoryReportType,
  InventoryReportSeverity,
  InventoryReportStatus,
} from "@prisma/client";
import { checkCleaningPropertyAccess } from "@/lib/cleaner/checkCleaningPropertyAccess";

const HOST_ROLES = ["OWNER", "ADMIN", "MANAGER", "AUXILIAR"];

/** Obtiene tenantId para contexto cleaner: valida acceso y retorna tenantId. */
async function getTenantIdForCleaner(
  formData: FormData,
  options?: { reviewId?: string; cleaningId?: string; reportId?: string; evidenceId?: string }
): Promise<{ tenantId: string; cleaningId: string }> {
  const user = await requireUser();
  if (HOST_ROLES.includes(user.role)) redirect("/host");

  let cleaningId =
    formData.get("cleaningId")?.toString() ||
    options?.cleaningId ||
    null;
  const reviewId = formData.get("reviewId")?.toString() || options?.reviewId;
  const reportId = options?.reportId;
  const evidenceId = options?.evidenceId;

  if (!cleaningId && evidenceId) {
    const evidence = await prisma.inventoryEvidence.findFirst({
      where: { id: evidenceId, reportId: { not: null } },
      include: { report: { select: { cleaningId: true, reviewId: true } } },
    });
    cleaningId = evidence?.report?.cleaningId ?? null;
    if (!cleaningId && evidence?.report?.reviewId) {
      const review = await prisma.inventoryReview.findFirst({
        where: { id: evidence.report.reviewId },
        select: { cleaningId: true },
      });
      cleaningId = review?.cleaningId ?? null;
    }
  }
  if (!cleaningId && reviewId) {
    const review = await prisma.inventoryReview.findFirst({
      where: { id: reviewId },
      select: { cleaningId: true },
    });
    cleaningId = review?.cleaningId ?? null;
  }
  if (!cleaningId && reportId) {
    const report = await prisma.inventoryReport.findFirst({
      where: { id: reportId },
      select: { cleaningId: true, reviewId: true },
    });
    cleaningId = report?.cleaningId ?? null;
    if (!cleaningId && report?.reviewId) {
      const review = await prisma.inventoryReview.findFirst({
        where: { id: report.reviewId },
        select: { cleaningId: true },
      });
      cleaningId = review?.cleaningId ?? null;
    }
  }

  if (!cleaningId) throw new Error("No se encontró la limpieza");

  const access = await checkCleaningPropertyAccess(cleaningId);
  if (!access.isAssigned) {
    throw new Error("No tienes acceso a esta limpieza");
  }

  const cleaning = await prisma.cleaning.findUnique({
    where: { id: cleaningId },
    select: { tenantId: true },
  });
  if (!cleaning) throw new Error("Limpieza no encontrada");
  return { tenantId: cleaning.tenantId, cleaningId };
}

/**
 * Crea o actualiza una revisión de inventario (DRAFT).
 * Si ya existe, la actualiza. Si no, la crea.
 */
export async function createOrUpdateInventoryReview(formData: FormData) {
  const isCleaner = formData.get("callerContext") === "cleaner";
  let tenantId: string;
  let cleaningId = formData.get("cleaningId")?.toString();

  if (isCleaner) {
    const ctx = await getTenantIdForCleaner(formData);
    tenantId = ctx.tenantId;
    cleaningId = ctx.cleaningId;
  } else {
    const user = await requireHostUser();
    tenantId = user.tenantId ?? "";
    if (!tenantId) throw new Error("Usuario sin tenant asociado");
    if (!cleaningId) throw new Error("No se encontró la limpieza");
  }

  if (!cleaningId) throw new Error("No se encontró la limpieza");

  // Verificar que la limpieza existe y obtener propertyId
  const cleaning = await prisma.cleaning.findFirst({
    where: { id: cleaningId, tenantId },
    select: { id: true, propertyId: true, tenantId: true },
  });

  if (!cleaning) {
    throw new Error("Limpieza no encontrada");
  }

  if (cleaning.tenantId !== tenantId) {
    throw new Error("No tienes permiso para esta limpieza");
  }

  // Buscar revisión existente
  const existingReview = await prisma.inventoryReview.findUnique({
    where: { cleaningId },
  });

  const reviewData = {
    tenantId: tenantId,
    cleaningId,
    propertyId: cleaning.propertyId,
    status: InventoryReviewStatus.DRAFT,
    notes: formData.get("notes")?.toString().trim() || null,
  };

  if (existingReview) {
    // Actualizar revisión existente (solo si está en DRAFT)
    if (existingReview.status !== InventoryReviewStatus.DRAFT) {
      throw new Error("No se puede modificar una revisión ya enviada");
    }

    const updated = await prisma.inventoryReview.update({
      where: { id: existingReview.id },
      data: reviewData,
    });

    revalidatePath(`/host/cleanings/${cleaningId}`);
    if (isCleaner) {
      revalidatePath(`/cleaner/cleanings/${cleaningId}`);
      revalidatePath(`/cleaner/cleanings/${cleaningId}/inventory-review`);
    }
    return { id: updated.id, status: updated.status };
  } else {
    // Crear nueva revisión
    const created = await prisma.inventoryReview.create({
      data: reviewData,
    });

    revalidatePath(`/host/cleanings/${cleaningId}`);
    if (isCleaner) {
      revalidatePath(`/cleaner/cleanings/${cleaningId}`);
      revalidatePath(`/cleaner/cleanings/${cleaningId}/inventory-review`);
    }
    return { id: created.id, status: created.status };
  }
}

/**
 * Envía una revisión de inventario (cambia status a SUBMITTED).
 * Valida que todos los cambios de cantidad tengan razón.
 */
export async function submitInventoryReview(formData: FormData) {
  const isCleaner = formData.get("callerContext") === "cleaner";
  let tenantId: string;

  if (isCleaner) {
    const ctx = await getTenantIdForCleaner(formData);
    tenantId = ctx.tenantId;
  } else {
    const user = await requireHostUser();
    tenantId = user.tenantId ?? "";
  }
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  const reviewId = formData.get("reviewId")?.toString();
  if (!reviewId) {
    throw new Error("No se encontró la revisión");
  }

  const review = await prisma.inventoryReview.findFirst({
    where: { id: reviewId, tenantId },
    include: {
      itemChanges: true,
    },
  });

  // Filtrar cambios donde la cantidad cambió (en JavaScript)
  if (review) {
    review.itemChanges = review.itemChanges.filter(
      (change) => change.quantityBefore !== change.quantityAfter
    );
  }

  if (!review) {
    throw new Error("Revisión no encontrada");
  }

  if (review.status !== InventoryReviewStatus.DRAFT) {
    throw new Error("Solo se pueden enviar revisiones en estado DRAFT");
  }

  // Validar que todos los cambios de cantidad tengan razón
  const changesWithoutReason = review.itemChanges.filter(
    (change) => !change.reason || (change.reason === InventoryChangeReason.OTHER && !change.reasonOtherText)
  );

  if (changesWithoutReason.length > 0) {
    throw new Error("Todos los cambios de cantidad deben tener una razón especificada");
  }

  // Actualizar status a SUBMITTED
  const updated = await prisma.inventoryReview.update({
    where: { id: reviewId },
    data: {
      status: InventoryReviewStatus.SUBMITTED,
      submittedAt: new Date(),
    },
  });

  // Revalidar tanto la página de detalle como la de inventory-review
  revalidatePath(`/host/cleanings/${review.cleaningId}`);
  revalidatePath(`/host/cleanings/${review.cleaningId}/inventory-review`);
  if (isCleaner) {
    revalidatePath(`/cleaner/cleanings/${review.cleaningId}`);
    revalidatePath(`/cleaner/cleanings/${review.cleaningId}/inventory-review`);
  }
  return { id: updated.id, status: updated.status };
}

/**
 * Crea o actualiza un cambio de cantidad en una revisión.
 */
export async function createOrUpdateInventoryChange(formData: FormData) {
  const isCleaner = formData.get("callerContext") === "cleaner";
  let tenantId: string;

  if (isCleaner) {
    const ctx = await getTenantIdForCleaner(formData);
    tenantId = ctx.tenantId;
  } else {
    const user = await requireHostUser();
    tenantId = user.tenantId ?? "";
  }
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  const reviewId = formData.get("reviewId")?.toString();
  const itemId = formData.get("itemId")?.toString();
  const inventoryLineId = formData.get("inventoryLineId")?.toString() || null;
  const quantityAfterStr = formData.get("quantityAfter")?.toString();
  const reasonStr = formData.get("reason")?.toString();
  const reasonOtherText = formData.get("reasonOtherText")?.toString().trim() || null;
  const note = formData.get("note")?.toString().trim() || null;

  if (!reviewId || !itemId || !quantityAfterStr) {
    throw new Error("Faltan datos requeridos");
  }

  const quantityAfter = parseInt(quantityAfterStr, 10);
  if (isNaN(quantityAfter) || quantityAfter < 0) {
    throw new Error("La cantidad debe ser un número válido mayor o igual a 0");
  }

  // Verificar que la revisión existe, pertenece al tenant y está en DRAFT
  const review = await prisma.inventoryReview.findFirst({
    where: { id: reviewId, tenantId },
    select: {
      id: true,
      status: true,
      cleaningId: true,
      cleaning: { select: { propertyId: true } },
    },
  });

  if (!review) {
    throw new Error("Revisión no encontrada");
  }

  if (review.status !== InventoryReviewStatus.DRAFT) {
    throw new Error("Solo se pueden modificar revisiones en estado DRAFT");
  }

  const propertyId = review.cleaning?.propertyId;

  // Obtener cantidad actual: si inventoryLineId, usar esa línea; si no, fallback por itemId+propertyId (legacy)
  let quantityBefore = 0;
  if (inventoryLineId) {
    const line = await prisma.inventoryLine.findFirst({
      where: {
        id: inventoryLineId,
        tenantId,
        itemId,
        isActive: true,
      },
      select: { expectedQty: true },
    });
    quantityBefore = line?.expectedQty ?? 0;
  } else if (propertyId) {
    const line = await prisma.inventoryLine.findFirst({
      where: {
        tenantId,
        propertyId,
        itemId,
        isActive: true,
      },
      select: { expectedQty: true },
    });
    quantityBefore = line?.expectedQty ?? 0;
  }

  // Si la cantidad no cambió, eliminar el cambio si existe
  if (quantityBefore === quantityAfter) {
    const deleteWhere: { reviewId: string; itemId: string; inventoryLineId?: string | null } = {
      reviewId,
      itemId,
    };
    if (inventoryLineId) {
      deleteWhere.inventoryLineId = inventoryLineId;
    } else {
      deleteWhere.inventoryLineId = null;
    }
    await prisma.inventoryReviewItemChange.deleteMany({
      where: deleteWhere,
    });

    revalidatePath(`/host/cleanings/${review.cleaningId}`);
    if (isCleaner) {
      revalidatePath(`/cleaner/cleanings/${review.cleaningId}`);
      revalidatePath(`/cleaner/cleanings/${review.cleaningId}/inventory-review`);
    }
    return { deleted: true };
  }

  // Validar razón si la cantidad cambió
  if (!reasonStr || !Object.values(InventoryChangeReason).includes(reasonStr as InventoryChangeReason)) {
    throw new Error("Debe especificar una razón válida para el cambio");
  }

  const reason = reasonStr as InventoryChangeReason;

  if (reason === InventoryChangeReason.OTHER && !reasonOtherText) {
    throw new Error("Debe especificar la razón cuando selecciona 'Otro'");
  }

  // Validar longitud de nota
  if (note && note.length > 200) {
    throw new Error("La nota no puede tener más de 200 caracteres");
  }

  // Buscar cambio existente: por inventoryLineId si se proporciona, sino por itemId con inventoryLineId null (legacy)
  const existingChangeWhere: { reviewId: string; itemId: string; inventoryLineId?: string | null } = {
    reviewId,
    itemId,
  };
  if (inventoryLineId) {
    existingChangeWhere.inventoryLineId = inventoryLineId;
  } else {
    existingChangeWhere.inventoryLineId = null;
  }
  const existingChange = await prisma.inventoryReviewItemChange.findFirst({
    where: existingChangeWhere,
  });

  const changeData = {
    tenantId: tenantId,
    reviewId,
    itemId,
    inventoryLineId: inventoryLineId ?? null,
    quantityBefore,
    quantityAfter,
    reason,
    reasonOtherText,
    note,
    status: InventoryChangeStatus.PENDING,
  };

  if (existingChange) {
    // Actualizar cambio existente
    const updated = await prisma.inventoryReviewItemChange.update({
      where: { id: existingChange.id },
      data: changeData,
    });

    revalidatePath(`/host/cleanings/${review.cleaningId}`);
    if (isCleaner) {
      revalidatePath(`/cleaner/cleanings/${review.cleaningId}`);
      revalidatePath(`/cleaner/cleanings/${review.cleaningId}/inventory-review`);
    }
    return { id: updated.id, quantityBefore: updated.quantityBefore, quantityAfter: updated.quantityAfter };
  } else {
    // Crear nuevo cambio
    const created = await prisma.inventoryReviewItemChange.create({
      data: changeData,
    });

    revalidatePath(`/host/cleanings/${review.cleaningId}`);
    if (isCleaner) {
      revalidatePath(`/cleaner/cleanings/${review.cleaningId}`);
      revalidatePath(`/cleaner/cleanings/${review.cleaningId}/inventory-review`);
    }
    return { id: created.id, quantityBefore: created.quantityBefore, quantityAfter: created.quantityAfter };
  }
}

/**
 * Crea un reporte de incidencia.
 */
export async function createInventoryReport(formData: FormData) {
  const isCleaner = formData.get("callerContext") === "cleaner";
  let tenantId: string;

  if (isCleaner) {
    const ctx = await getTenantIdForCleaner(formData);
    tenantId = ctx.tenantId;
  } else {
    const user = await requireHostUser();
    tenantId = user.tenantId ?? "";
  }
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  const reviewId = formData.get("reviewId")?.toString() || null;
  const cleaningId = formData.get("cleaningId")?.toString() || null;
  const itemId = formData.get("itemId")?.toString();
  const inventoryLineId = formData.get("inventoryLineId")?.toString() || null;
  const reportId = formData.get("reportId")?.toString() || null; // ID del reporte existente a actualizar
  const typeStr = formData.get("type")?.toString();
  const severityStr = formData.get("severity")?.toString() || "INFO";
  const description = formData.get("description")?.toString().trim() || null;

  if (!itemId || !typeStr) {
    throw new Error("Faltan datos requeridos");
  }

  if (!Object.values(InventoryReportType).includes(typeStr as InventoryReportType)) {
    throw new Error("Tipo de reporte inválido");
  }

  if (!Object.values(InventoryReportSeverity).includes(severityStr as InventoryReportSeverity)) {
    throw new Error("Severidad inválida");
  }

  const type = typeStr as InventoryReportType;
  const severity = severityStr as InventoryReportSeverity;

  // Verificar que el item existe y pertenece al tenant
  const item = await prisma.inventoryItem.findFirst({
    where: { id: itemId, tenantId },
    select: { id: true },
  });

  if (!item) {
    throw new Error("Item no encontrado");
  }

  // Obtener el usuario que crea el reporte
  // Cleaner: siempre el usuario actual. Host: prioridad reviewedByUserId, assignedToId, o fallback
  let createdByUserId: string | null = null;

  if (isCleaner) {
    const user = await requireUser();
    createdByUserId = user.id;
  }

  // 1. Intentar obtener el usuario de la revisión (solo host)
  if (!createdByUserId && reviewId) {
    const review = await prisma.inventoryReview.findFirst({
      where: { id: reviewId, tenantId },
      select: { id: true, reviewedByUserId: true },
    });

    if (!review) {
      throw new Error("Revisión no encontrada");
    }

    if (review.reviewedByUserId) {
      createdByUserId = review.reviewedByUserId;
    }
  }

  // 2. Si no hay usuario, intentar obtenerlo de la limpieza
  if (!createdByUserId && cleaningId) {
    const cleaning = await prisma.cleaning.findFirst({
      where: { id: cleaningId, tenantId },
      select: { assignedToId: true },
    });

    if (cleaning && cleaning.assignedToId) {
      createdByUserId = cleaning.assignedToId;
    }
  }

  // 3. Si aún no hay usuario, buscar cualquier Cleaner del tenant como fallback
  if (!createdByUserId) {
    const defaultUser = await prisma.user.findFirst({
      where: { tenantId: tenantId, role: "CLEANER" },
    });

    if (!defaultUser) {
      // Si no hay Cleaner, intentar con cualquier usuario del tenant como último recurso
      const anyUser = await prisma.user.findFirst({
        where: { tenantId: tenantId },
      });

      if (!anyUser) {
        throw new Error("No se encontró un usuario para crear el reporte");
      }

      createdByUserId = anyUser.id;
    } else {
      createdByUserId = defaultUser.id;
    }
  }

  // Si se proporciona reportId, actualizar ese reporte específico
  // Si no, buscar si ya existe un reporte para este item en esta revisión
  let existingReport = null;

  if (reportId) {
    // Buscar el reporte específico por ID
    existingReport = await prisma.inventoryReport.findFirst({
      where: {
        id: reportId,
        tenantId: tenantId,
        status: InventoryReportStatus.PENDING,
      },
    });
  } else if (reviewId) {
    // Buscar por reviewId + itemId + inventoryLineId (si se proporciona)
    const reportWhere: {
      tenantId: string;
      reviewId: string;
      itemId: string;
      inventoryLineId?: string | null;
      status: InventoryReportStatus;
    } = {
      tenantId: tenantId,
      reviewId,
      itemId,
      status: InventoryReportStatus.PENDING,
    };
    if (inventoryLineId) {
      reportWhere.inventoryLineId = inventoryLineId;
    } else {
      reportWhere.inventoryLineId = null;
    }
    existingReport = await prisma.inventoryReport.findFirst({
      where: reportWhere,
    });
  }

  let report;
  if (existingReport) {
    // Actualizar el reporte existente
    report = await prisma.inventoryReport.update({
      where: { id: existingReport.id },
      data: {
        type,
        severity,
        description,
        updatedAt: new Date(),
      },
    });
  } else {
    // Crear nuevo reporte
    report = await prisma.inventoryReport.create({
      data: {
        tenantId: tenantId,
        reviewId,
        cleaningId,
        itemId,
        inventoryLineId: inventoryLineId ?? null,
        type,
        severity,
        description,
        status: InventoryReportStatus.PENDING,
        createdByUserId: createdByUserId,
      },
    });
  }

  if (reviewId) {
    const review = await prisma.inventoryReview.findFirst({
      where: { id: reviewId, tenantId },
      select: { cleaningId: true },
    });

    if (review) {
      revalidatePath(`/host/cleanings/${review.cleaningId}`);
      if (isCleaner) {
        revalidatePath(`/cleaner/cleanings/${review.cleaningId}`);
        revalidatePath(`/cleaner/cleanings/${review.cleaningId}/inventory-review`);
      }
    }
  }

  // Devolver el reporte con sus evidencias actuales para que el frontend
  // pueda reconstruir el estado local desde la fuente de verdad del backend
  const fullReport = await prisma.inventoryReport.findFirst({
    where: { id: report.id, tenantId },
    select: {
      id: true,
      status: true,
      type: true,
      severity: true,
      description: true,
      itemId: true,
      inventoryLineId: true,
      evidence: {
        select: {
          id: true,
          assetId: true,
          asset: { select: { id: true, publicUrl: true, variant: true } },
        },
      },
    },
  });

  return {
    id: report.id,
    status: report.status,
    evidence: fullReport?.evidence ?? [],
  };
}

/**
 * Elimina un reporte de inventario (solo si está en estado PENDING).
 */
export async function deleteInventoryReport(
  reportId: string,
  options?: { callerContext?: "host" | "cleaner" }
) {
  const isCleaner = options?.callerContext === "cleaner";
  let tenantId: string;

  if (isCleaner) {
    const ctx = await getTenantIdForCleaner(new FormData(), { reportId });
    tenantId = ctx.tenantId;
  } else {
    const user = await requireHostUser();
    tenantId = user.tenantId ?? "";
  }
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  const report = await prisma.inventoryReport.findFirst({
    where: { id: reportId, tenantId },
    select: {
      id: true,
      status: true,
      reviewId: true,
      evidence: {
        select: {
          id: true,
          assetId: true,
          asset: { select: { id: true, bucket: true, key: true } },
        },
      },
    },
  });

  if (!report) {
    throw new Error("Reporte no encontrado");
  }

  // Regla de negocio: solo se puede eliminar si el Host aún no lo ha procesado (PENDING)
  if (report.status !== InventoryReportStatus.PENDING) {
    throw new Error("No puedes eliminar una incidencia que ya fue procesada por el Host");
  }

  // Cleanup completo: borrar archivos en Storage antes de tocar BD
  for (const evidence of report.evidence) {
    const bucket = evidence.asset?.bucket;
    const key = evidence.asset?.key;
    if (bucket && key) {
      try {
        await storageProvider.deleteObject({ bucket, key });
      } catch (err) {
        console.warn(`[deleteInventoryReport] No se pudo borrar archivo en Storage para evidence ${evidence.id}:`, err);
      }
    }
  }

  // Borrar en BD: evidencias, assets y reporte en transacción
  const assetIds = report.evidence.map((e) => e.assetId);
  await prisma.$transaction(async (tx) => {
    if (report.evidence.length > 0) {
      await tx.inventoryEvidence.deleteMany({
        where: { reportId, tenantId },
      });
      if (assetIds.length > 0) {
        await tx.asset.deleteMany({
          where: { id: { in: assetIds }, tenantId },
        });
      }
    }
    await tx.inventoryReport.delete({
      where: { id: reportId },
    });
  });

  if (report.reviewId) {
    const review = await prisma.inventoryReview.findFirst({
      where: { id: report.reviewId, tenantId },
      select: { cleaningId: true },
    });

    if (review) {
      revalidatePath(`/host/cleanings/${review.cleaningId}`);
      if (isCleaner) {
        revalidatePath(`/cleaner/cleanings/${review.cleaningId}`);
        revalidatePath(`/cleaner/cleanings/${review.cleaningId}/inventory-review`);
      }
    }
  }

  return { success: true };
}

const MAX_EVIDENCE_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EVIDENCE_MIME = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic"];

/**
 * Sube una imagen como evidencia de un reporte de inventario.
 * Crea Asset + InventoryEvidence. Soporta contexto cleaner y host.
 */
export async function uploadInventoryReportEvidence(formData: FormData) {
  const isCleaner = formData.get("callerContext") === "cleaner";
  let tenantId: string;
  let createdByUserId: string | null = null;

  if (isCleaner) {
    const user = await requireUser();
    createdByUserId = user.id;
    const ctx = await getTenantIdForCleaner(formData, {
      reportId: formData.get("reportId")?.toString() ?? undefined,
    });
    tenantId = ctx.tenantId;
  } else {
    const user = await requireHostUser();
    tenantId = user.tenantId ?? "";
    createdByUserId = user.id;
  }
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  const reportId = formData.get("reportId")?.toString();
  const file = formData.get("file") as File | null;
  if (!reportId || !file) {
    throw new Error("reportId y file son requeridos");
  }
  if (file.size === 0) {
    throw new Error("El archivo está vacío. Selecciona una imagen válida.");
  }

  if (!ALLOWED_EVIDENCE_MIME.includes(file.type)) {
    throw new Error("Tipo de archivo no permitido. Use JPG, PNG, WebP o HEIC.");
  }
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.length > MAX_EVIDENCE_FILE_SIZE) {
    throw new Error("El archivo es demasiado grande. Máximo 10MB.");
  }

  const report = await prisma.inventoryReport.findFirst({
    where: { id: reportId, tenantId },
    select: { id: true, reviewId: true },
  });
  if (!report) throw new Error("Reporte no encontrado");

  const assetId = createId();
  const ext = file.name.split(".").pop() || "jpg";
  const now = new Date();
  const storageKey = `tenants/${tenantId}/assets/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${assetId}.${ext}`;
  const bucket = "assets";

  const { publicUrl } = await storageProvider.putPublicObject({
    bucket,
    key: storageKey,
    contentType: file.type,
    buffer,
  });

  await prisma.$transaction([
    prisma.asset.create({
      data: {
        id: assetId,
        tenantId,
        type: "IMAGE",
        provider: "SUPABASE",
        variant: "ORIGINAL",
        bucket,
        key: storageKey,
        publicUrl,
        mimeType: file.type,
        sizeBytes: buffer.length,
        width: null,
        height: null,
        groupId: assetId,
        uploadedAt: new Date(),
        createdByUserId,
      },
    }),
    prisma.inventoryEvidence.create({
      data: {
        tenantId,
        reportId,
        assetId,
      },
    }),
  ]);

  if (report.reviewId) {
    const review = await prisma.inventoryReview.findFirst({
      where: { id: report.reviewId, tenantId },
      select: { cleaningId: true },
    });
    if (review) {
      revalidatePath(`/host/cleanings/${review.cleaningId}`);
      if (isCleaner) {
        revalidatePath(`/cleaner/cleanings/${review.cleaningId}`);
        revalidatePath(`/cleaner/cleanings/${review.cleaningId}/inventory-review`);
      }
    }
  }

  return { assetId, url: publicUrl };
}

/**
 * Elimina una evidencia (imagen) persistida de un reporte de inventario.
 * Borra InventoryEvidence, Asset asociado y archivo en Storage (si existe).
 * Soporta contexto cleaner y host.
 */
export async function deleteInventoryReportEvidence(evidenceId: string, options?: { callerContext?: "host" | "cleaner" }) {
  const isCleaner = options?.callerContext === "cleaner";
  let tenantId: string;

  if (isCleaner) {
    const ctx = await getTenantIdForCleaner(new FormData(), { evidenceId });
    tenantId = ctx.tenantId;
  } else {
    const user = await requireHostUser();
    tenantId = user.tenantId ?? "";
  }
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  const evidence = await prisma.inventoryEvidence.findFirst({
    where: { id: evidenceId, tenantId, reportId: { not: null } },
    include: {
      asset: { select: { id: true, bucket: true, key: true } },
      report: { select: { id: true, reviewId: true, status: true } },
    },
  });

  if (!evidence || !evidence.reportId || !evidence.report) {
    throw new Error("Evidencia no encontrada o no pertenece a un reporte");
  }

  // Regla de negocio: solo se puede eliminar si el Host aún no lo ha procesado (PENDING)
  if (evidence.report.status !== InventoryReportStatus.PENDING) {
    throw new Error("No puedes eliminar evidencias de una incidencia que ya fue procesada por el Host");
  }

  const assetId = evidence.assetId;
  const bucket = evidence.asset?.bucket;
  const key = evidence.asset?.key;

  await prisma.$transaction([
    prisma.inventoryEvidence.delete({ where: { id: evidenceId, tenantId } }),
    prisma.asset.delete({ where: { id: assetId, tenantId } }),
  ]);

  if (bucket && key) {
    try {
      await storageProvider.deleteObject({ bucket, key });
    } catch (err) {
      console.warn("[deleteInventoryReportEvidence] No se pudo borrar archivo en Storage:", err);
    }
  }

  if (evidence.report?.reviewId) {
    const review = await prisma.inventoryReview.findFirst({
      where: { id: evidence.report.reviewId, tenantId },
      select: { cleaningId: true },
    });
    if (review) {
      revalidatePath(`/host/cleanings/${review.cleaningId}`);
      if (isCleaner) {
        revalidatePath(`/cleaner/cleanings/${review.cleaningId}`);
        revalidatePath(`/cleaner/cleanings/${review.cleaningId}/inventory-review`);
      }
    }
  }

  return { success: true };
}

/**
 * Obtiene las líneas de inventario activas de una propiedad para la revisión.
 */
export async function getActiveInventoryLines(propertyId: string) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) return [];
  const { fetchActiveInventoryLines } = await import("@/lib/inventory-review-queries");
  return fetchActiveInventoryLines(propertyId, tenantId);
}

/**
 * Obtiene una revisión de inventario con todos sus datos.
 */
export async function getInventoryReview(cleaningId: string) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) return null;
  const { fetchInventoryReview } = await import("@/lib/inventory-review-queries");
  return fetchInventoryReview(cleaningId, tenantId);
}

/**
 * Obtiene el estado de una revisión de inventario (solo id y status) para mostrar rápidamente.
 */
export async function getInventoryReviewStatus(cleaningId: string) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  const review = await prisma.inventoryReview.findFirst({
    where: { cleaningId, tenantId },
    select: {
      id: true,
      status: true,
      tenantId: true, // Incluir tenantId para la verificación
    },
  });

  if (!review || review.tenantId !== tenantId) {
    return null;
  }

  return review;
}

