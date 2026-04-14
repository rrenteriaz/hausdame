"use server";

import prisma from "@/lib/prisma";
import { requireUser } from "@/lib/auth/requireUser";
import { requireCleanerAccessToCleaning } from "@/lib/cleaner/requireCleanerAccessToCleaning";
import { InventoryPriority } from "@/lib/generated/prisma";
import { revalidatePath } from "next/cache";

// Temporal: hasta que se aplique la migración
type InventoryCheckStatus = "OK" | "MISSING" | "DAMAGED";

/**
 * Obtiene el inventario de una propiedad para una limpieza específica,
 * incluyendo los checks existentes.
 * Usa requireCleanerAccessToCleaning porque el cleaning pertenece al tenant Host,
 * no al tenant del Cleaner (Services).
 */
export async function getInventoryForCleaning(cleaningId: string) {
  await requireUser();

  const { cleaning } = await requireCleanerAccessToCleaning(cleaningId);

  // Obtener todas las líneas de inventario activas de la propiedad
  const propertyId = cleaning.property.id;
  const tenantId = cleaning.tenantId;
  const inventoryLines = await prisma.inventoryLine.findMany({
    where: {
      propertyId,
      tenantId,
      isActive: true,
    },
    include: {
      item: {
        select: {
          id: true,
          name: true,
          category: true,
        },
      },
      // Fase 5: zona física como source of truth para nombre y orden
      propertyZone: {
        select: {
          id: true,
          name: true,
          sortOrder: true,
          zoneType: true,
        },
      },
    },
    orderBy: [
      { priority: "desc" }, // HIGH primero
      { propertyZone: { sortOrder: "asc" } }, // Fase 5: orden por sortOrder de zona
      { item: { name: "asc" } },
    ],
  });

  // Obtener checks existentes para esta limpieza
  const checks = await (prisma as any).inventoryCheck.findMany({
    where: {
      cleaningId,
      tenantId,
    },
    select: {
      inventoryLineId: true,
      status: true,
      note: true,
    },
  });

  // Construir mapa de checks por inventoryLineId
  const checksMap = new Map<string, { status: InventoryCheckStatus; note: string | null }>();
  for (const check of checks) {
    checksMap.set(check.inventoryLineId, {
      status: check.status,
      note: check.note,
    });
  }

  // Construir DTO con información combinada
  // Fase 5: usar propertyZone.name como source of truth para el área.
  // Fallback temporal a line.area para líneas sin zona (no debería ocurrir post-Fase 4).
  return inventoryLines.map((line) => ({
    lineId: line.id,
    itemName: line.item.name,
    area: line.propertyZone?.name ?? line.area,
    propertyZone: line.propertyZone ?? null,
    attentionLevel: line.priority as InventoryPriority,
    currentStatus: checksMap.get(line.id)?.status || null,
    note: checksMap.get(line.id)?.note || null,
  }));
}

/**
 * Establece el estado de verificación de un item de inventario.
 */
export async function setInventoryCheck(
  cleaningId: string,
  inventoryLineId: string,
  status: InventoryCheckStatus,
  note?: string | null
) {
  await requireUser();

  const { cleaning, user } = await requireCleanerAccessToCleaning(cleaningId);
  const propertyId = cleaning.property.id;
  const tenantId = cleaning.tenantId;

  // Validar que la línea de inventario existe y pertenece a la propiedad
  const inventoryLine = await prisma.inventoryLine.findFirst({
    where: {
      id: inventoryLineId,
      propertyId,
      tenantId,
    },
    select: {
      id: true,
      itemId: true,
    },
  });

  if (!inventoryLine) {
    throw new Error("Línea de inventario no encontrada");
  }

  // Upsert del check
  const check = await (prisma as any).inventoryCheck.upsert({
    where: {
      cleaningId_inventoryLineId: {
        cleaningId,
        inventoryLineId,
      },
    },
    create: {
      tenantId,
      propertyId,
      cleaningId,
      inventoryLineId,
      inventoryItemId: inventoryLine.itemId,
      status,
      note: note || null,
      createdByUserId: user.id,
    },
    update: {
      status,
      note: note || null,
    },
    select: {
      status: true,
      note: true,
    },
  });

  revalidatePath(`/cleaner/cleanings/${cleaningId}`);
  revalidatePath(`/cleaner/cleanings/${cleaningId}/inventory`);

  return check;
}

/**
 * Obtiene el resumen de problemas (MISSING + DAMAGED) para una limpieza.
 */
export async function getInventoryProblemsSummary(cleaningId: string) {
  await requireUser();

  const { cleaning } = await requireCleanerAccessToCleaning(cleaningId);
  const tenantId = cleaning.tenantId;

  const checks = await (prisma as any).inventoryCheck.findMany({
    where: {
      cleaningId,
      tenantId,
      status: {
        in: ["MISSING", "DAMAGED"],
      },
    },
    select: {
      status: true,
    },
  });

  const missing = checks.filter((c: { status: string }) => c.status === "MISSING").length;
  const damaged = checks.filter((c: { status: string }) => c.status === "DAMAGED").length;

  return {
    total: missing + damaged,
    missing,
    damaged,
  };
}

