/**
 * Server Actions para gestionar el checklist en la vista del cleaner
 */

"use server";

import prisma from "@/lib/prisma";
import { getDefaultTenant } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { NotCompletedReasonCode } from "@prisma/client";

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
  incompleteItems: Array<{
    itemId: string;
    reasonCode: NotCompletedReasonCode;
    reasonNote?: string;
  }>
): Promise<{ success: boolean; requiresInventoryReview?: boolean }> {
  const tenant = await getDefaultTenant();
  if (!tenant) {
    throw new Error("No tenant found");
  }

  // GATING: Verificar que existe una revisión de inventario SUBMITTED antes de permitir concluir
  try {
    const inventoryReview = await prisma.inventoryReview.findUnique({
      where: {
        cleaningId: cleaningId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    console.log("[completeCleaningWithReasons] Verificando revisión de inventario:", {
      cleaningId,
      hasReview: !!inventoryReview,
      reviewStatus: inventoryReview?.status,
    });

    if (!inventoryReview || inventoryReview.status !== "SUBMITTED") {
      console.warn(`[completeCleaningWithReasons] Revisión de inventario requerida o no enviada para cleaningId: ${cleaningId}. Status: ${inventoryReview?.status}`);
      // Retornar resultado en lugar de lanzar error
      return { success: false, requiresInventoryReview: true };
    }
    console.log(`[completeCleaningWithReasons] Revisión de inventario SUBMITTED encontrada para cleaningId: ${cleaningId}`);
  } catch (error: any) {
    console.error("[completeCleaningWithReasons] Error al verificar revisión de inventario:", error);
    // Si el error es por tabla no encontrada (migración no aplicada), lanzar un error más específico
    if (error.message.includes("does not exist") || error.message.includes("P2025")) {
      throw new Error("DATABASE_SCHEMA_MISMATCH: La tabla InventoryReview no existe. Asegúrate de que la migración se haya aplicado.");
    }
    // Para otros errores, propagarlos
    throw error;
  }

  // 2. Validar que no falten items por completar (que no se enviaron razones para ellos)
  // Obtenemos los IDs de los items que se enviaron con razones
  const itemIdsWithReasons = new Set(incompleteItems.map(i => i.itemId));
  
  // Buscamos en DB si hay CUALQUIER otro item activo que no esté completado y no esté en la lista enviada
  const missingIncompleteItems = await (prisma as any).cleaningChecklistItem.count({
    where: {
      cleaningId,
      tenantId: tenant.id,
      isCompleted: false,
      isRemovedFromTemplate: false,
      NOT: {
        id: { in: Array.from(itemIdsWithReasons) }
      }
    }
  });

  if (missingIncompleteItems > 0) {
    throw new Error("No se pueden completar: Hay tareas pendientes de marcar o justificar.");
  }

  // 3. Actualizar razones de items incompletos
  for (const item of incompleteItems) {
    await (prisma as any).cleaningChecklistItem.updateMany({
      where: {
        id: item.itemId,
        cleaningId,
        tenantId: tenant.id,
      },
      data: {
        notCompletedReasonCode: item.reasonCode,
        notCompletedReasonNote: item.reasonNote || null,
      },
    });
  }

  // Marcar limpieza como completada
  await (prisma as any).cleaning.updateMany({
    where: {
      id: cleaningId,
      tenantId: tenant.id,
    },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      // Si hay items incompletos, marcar needsAttention
      needsAttention: incompleteItems.length > 0,
      attentionReason:
        incompleteItems.length > 0 ? "CHECKLIST_INCOMPLETO" : null,
    },
  });

  revalidatePath(`/cleaner/cleanings/${cleaningId}`);
  revalidatePath("/cleaner");
  revalidatePath("/host/cleanings");

  return { success: true };
}

