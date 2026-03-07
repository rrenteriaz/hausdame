/**
 * Helper para sincronizar el snapshot del checklist entre la propiedad y una limpieza.
 * Implementa un contrato de sincronización que permite actualizaciones inteligentes
 * mientras la limpieza está en curso, preservando el progreso del cleaner.
 */

import prisma from "@/lib/prisma";

/**
 * Sincroniza el snapshot del checklist de una limpieza con la plantilla actual de la propiedad.
 * Solo se permite si la limpieza está en PENDING o IN_PROGRESS.
 */
export async function syncChecklistSnapshotForCleaning(
  tenantId: string,
  propertyId: string,
  cleaningId: string
): Promise<void> {
  // 1. Verificar estado de la limpieza
  const cleaning = await prisma.cleaning.findUnique({
    where: { id: cleaningId },
    select: { status: true }
  });

  // Si la limpieza ya está completada o cancelada, no se toca el snapshot
  if (!cleaning || (cleaning.status !== "PENDING" && cleaning.status !== "IN_PROGRESS")) {
    return;
  }

  // 2. Obtener items ACTIVOS de la plantilla de la propiedad
  const templateItems = await (prisma as any).propertyChecklistItem.findMany({
    where: {
      propertyId,
      tenantId,
      isActive: true,
    },
    orderBy: { sortOrder: "asc" },
  });

  // 3. Obtener items actuales del snapshot de la limpieza
  const existingSnapshots = await (prisma as any).cleaningChecklistItem.findMany({
    where: {
      cleaningId,
      tenantId,
    },
  });

  // 4. Mapear snapshots existentes por propertyChecklistItemId
  const snapshotMap = new Map<string, any>();
  const legacySnapshots: any[] = []; // Para migración

  existingSnapshots.forEach((s: any) => {
    if (s.propertyChecklistItemId) {
      snapshotMap.set(s.propertyChecklistItemId, s);
    } else {
      legacySnapshots.push(s);
    }
  });

  // 5. Estrategia de Sanación/Migración para snapshots sin ID estable
  // Intentamos vincular por area + title si no tienen ID
  if (legacySnapshots.length > 0) {
    for (const legacy of legacySnapshots) {
      const match = templateItems.find((t: any) => 
        t.area === legacy.area && 
        t.title === legacy.title &&
        !snapshotMap.has(t.id) // Solo si no está ya mapeado
      );

      if (match) {
        // Encontramos un vínculo probable, actualizarlo en DB y en nuestro mapa local
        await (prisma as any).cleaningChecklistItem.update({
          where: { id: legacy.id },
          data: { propertyChecklistItemId: match.id }
        });
        snapshotMap.set(match.id, { ...legacy, propertyChecklistItemId: match.id });
      } else {
        // Si no hay match y es un snapshot viejo sin ID, lo marcamos como removido
        // porque ya no existe en la plantilla actual (o ha cambiado demasiado)
        await (prisma as any).cleaningChecklistItem.update({
          where: { id: legacy.id },
          data: { isRemovedFromTemplate: true }
        });
      }
    }
  }

  // 6. Procesar items de la plantilla (ADD / RESTORE / SYNC METADATA)
  for (const templateItem of templateItems) {
    const existing = snapshotMap.get(templateItem.id);

    if (!existing) {
      // ADD: Crear nuevo item en el snapshot
      await (prisma as any).cleaningChecklistItem.create({
        data: {
          tenantId,
          cleaningId,
          propertyChecklistItemId: templateItem.id,
          area: templateItem.area,
          title: templateItem.title,
          sortOrder: templateItem.sortOrder,
          isCompleted: false,
          requiresValue: templateItem.requiresValue || false,
          valueLabel: templateItem.valueLabel || null,
          isRemovedFromTemplate: false,
        },
      });
    } else {
      // SYNC: Actualizar metadata de items existentes (por si cambió el título o el orden)
      // Pero PRESERVANDO el estado de ejecución (isCompleted, valueNumber, etc.)
      await (prisma as any).cleaningChecklistItem.update({
        where: { id: existing.id },
        data: {
          area: templateItem.area,
          title: templateItem.title,
          sortOrder: templateItem.sortOrder,
          requiresValue: templateItem.requiresValue || false,
          valueLabel: templateItem.valueLabel || null,
          isRemovedFromTemplate: false, // RESTORE: Si estaba marcado como removido pero ahora volvió a la plantilla
        },
      });
    }
  }

  // 7. DEACTIVATE (Logical Delete): Marcar como removidos los items que ya no están en la plantilla
  const activeTemplateIds = new Set(templateItems.map((t: any) => t.id));
  const snapshotsToDeactivate = existingSnapshots.filter((s: any) => 
    s.propertyChecklistItemId && !activeTemplateIds.has(s.propertyChecklistItemId) && !s.isRemovedFromTemplate
  );

  if (snapshotsToDeactivate.length > 0) {
    await (prisma as any).cleaningChecklistItem.updateMany({
      where: {
        id: { in: snapshotsToDeactivate.map((s: any) => s.id) },
      },
      data: { isRemovedFromTemplate: true },
    });
  }
}

/**
 * Alias para compatibilidad con llamadas existentes si las hubiera
 * aunque ahora se recomienda usar sync directamente.
 */
export async function createChecklistSnapshotForCleaning(
  tenantId: string,
  propertyId: string,
  cleaningId: string
): Promise<void> {
  return syncChecklistSnapshotForCleaning(tenantId, propertyId, cleaningId);
}

