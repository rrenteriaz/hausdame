/**
 * Server Actions para gestionar el checklist en la vista del cleaner
 */

"use server";

import prisma from "@/lib/prisma";
import { getDefaultTenant } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { validateJobCompletion } from "@/lib/tareas-pro/validation";

export async function updateChecklistItemCompletion(
  cleaningId: string,
  itemId: string,
  isCompleted: boolean,
  valueNumber?: number | null
) {
  const tenant = await getDefaultTenant();
  if (!tenant) return;

  await (prisma as any).cleaningChecklistItem.updateMany({
    where: {
      id: itemId,
      cleaningId,
      tenantId: tenant.id,
    },
    data: {
      isCompleted,
      // Si se marca como completado, limpiar razones y setear cantidad si viene
      ...(isCompleted
        ? {
            notCompletedReasonCode: null,
            notCompletedReasonNote: null,
            valueNumber: valueNumber ?? null,
          }
        : {
            // Si se desmarca, limpiar cantidad también
            valueNumber: null,
          }),
    },
  });

  // Revalidar para que otros componentes (como el botón de completar) se actualicen
  revalidatePath(`/cleaner/cleanings/${cleaningId}`);
}

export async function completeCleaningWithReasons(
  cleaningId: string,
  // Parámetro mantenido por compatibilidad — ya no se usa para validar ni bloquear
  _incompleteItems?: Array<{
    itemId: string;
    reasonCode: string;
    reasonNote?: string;
  }>
): Promise<{ success: boolean; requiresInventoryReview?: boolean }> {
  const tenant = await getDefaultTenant();
  if (!tenant) {
    throw new Error("No tenant found");
  }

  // ── 1. GATING: Inventario ───────────────────────────────────────────
  // La revisión de inventario sigue siendo obligatoria antes de completar.
  try {
    const inventoryReview = await prisma.inventoryReview.findUnique({
      where: { cleaningId },
      select: { id: true, status: true },
    });

    if (!inventoryReview || inventoryReview.status !== "SUBMITTED") {
      return { success: false, requiresInventoryReview: true };
    }
  } catch (error: any) {
    if (error.message.includes("does not exist") || error.message.includes("P2025")) {
      throw new Error("DATABASE_SCHEMA_MISMATCH: La tabla InventoryReview no existe.");
    }
    throw error;
  }

  // ── 2. GATING: Tareas de la propiedad ──────────────────────────────
  // Si hay TaskJobs vinculados a esta limpieza con pasos obligatorios pendientes,
  // bloquear el cierre. NO filtrar por user.tenantId — los jobs pertenecen al
  // tenant del Host. Se usa el tenantId de cada job.
  const linkedJobs = await prisma.taskJob.findMany({
    where: {
      cleaningId,
      status: { in: ["PENDING", "IN_PROGRESS"] },
    },
    select: { id: true, tenantId: true },
  });

  if (linkedJobs.length > 0) {
    const allBlockers: string[] = [];
    for (const job of linkedJobs) {
      const { canComplete, blockers } = await validateJobCompletion(job.id, job.tenantId);
      if (!canComplete) {
        allBlockers.push(...blockers);
      }
    }
    if (allBlockers.length > 0) {
      throw new Error(
        `Hay tareas de la propiedad con pasos obligatorios pendientes:\n${allBlockers.join("\n")}`
      );
    }
  }

  // ── 3. Marcar limpieza como completada ─────────────────────────────
  await (prisma as any).cleaning.updateMany({
    where: {
      id: cleaningId,
      tenantId: tenant.id,
    },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      needsAttention: false,
      attentionReason: null,
    },
  });

  revalidatePath(`/cleaner/cleanings/${cleaningId}`);
  revalidatePath("/cleaner");
  revalidatePath("/host/cleanings");

  return { success: true };
}
