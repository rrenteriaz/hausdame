/**
 * recurring-due.ts
 *
 * Operaciones de dominio sobre TaskRecurringDue.
 * Cada función aplica su propia autorización (tenantId) antes de mutar.
 */

import prisma from "@/lib/prisma";

/** Devuelve todas las obligaciones abiertas de un tenant, ordenadas por creación. */
export async function getOpenRecurringDues(tenantId: string) {
  return prisma.taskRecurringDue.findMany({
    where: { tenantId, status: { in: ["PENDING_ASSIGNMENT", "ASSIGNED"] } },
    orderBy: { createdAt: "asc" },
    include: {
      template: { select: { name: true } },
      property: { select: { name: true, shortName: true } },
      assignedCleaning: { select: { scheduledDate: true, status: true } },
      step: { select: { name: true, stepAnchorDayOfWeek: true, stepAnchorDayOfMonth: true } },
    },
  });
}

/** Marca una obligación como SKIPPED. Solo si está en estado abierto. */
export async function skipRecurringDue(
  dueId: string,
  tenantId: string,
  skipReason?: string,
): Promise<void> {
  const due = await prisma.taskRecurringDue.findFirst({
    where: { id: dueId, tenantId, status: { in: ["PENDING_ASSIGNMENT", "ASSIGNED"] } },
    select: { id: true },
  });
  if (!due) throw new Error("Obligación no encontrada o ya resuelta.");

  await prisma.taskRecurringDue.update({
    where: { id: dueId },
    data: { status: "SKIPPED", skippedAt: new Date(), skipReason: skipReason ?? null },
  });
}

/**
 * Asigna una obligación a una limpieza concreta.
 * El job de la limpieza se generará automáticamente cuando el cleaner la abra
 * (via syncTaskJobsForCleaning, que incluye todos los templates ACTIVE de la propiedad).
 */
export async function assignRecurringDueToCleaning(
  dueId: string,
  cleaningId: string,
  tenantId: string,
): Promise<void> {
  const due = await prisma.taskRecurringDue.findFirst({
    where: { id: dueId, tenantId, status: { in: ["PENDING_ASSIGNMENT", "ASSIGNED"] } },
    select: { id: true, propertyId: true },
  });
  if (!due) throw new Error("Obligación no encontrada o ya resuelta.");

  // Verificar que la limpieza pertenece al mismo tenant y propiedad
  const cleaning = await prisma.cleaning.findFirst({
    where: { id: cleaningId, tenantId, propertyId: due.propertyId },
    select: { id: true },
  });
  if (!cleaning) throw new Error("Limpieza no encontrada o incompatible con esta obligación.");

  await prisma.taskRecurringDue.update({
    where: { id: dueId },
    data: { status: "ASSIGNED", assignedCleaningId: cleaningId, assignedAt: new Date() },
  });
}

/**
 * Marca una obligación como COMPLETED.
 * Llamar cuando la limpieza asignada complete el job correspondiente.
 * En Fase 2 esto puede automatizarse conectando al completion flow del job.
 */
export async function completeRecurringDue(dueId: string, tenantId: string): Promise<void> {
  const due = await prisma.taskRecurringDue.findFirst({
    where: { id: dueId, tenantId, status: { in: ["PENDING_ASSIGNMENT", "ASSIGNED"] } },
    select: { id: true },
  });
  if (!due) throw new Error("Obligación no encontrada o ya resuelta.");

  await prisma.taskRecurringDue.update({
    where: { id: dueId },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
}

/**
 * Desvincula una obligación de su limpieza asignada (si la limpieza se cancela).
 * Vuelve a PENDING_ASSIGNMENT para que el host pueda reasignarla.
 */
export async function unassignRecurringDue(dueId: string, tenantId: string): Promise<void> {
  const due = await prisma.taskRecurringDue.findFirst({
    where: { id: dueId, tenantId, status: "ASSIGNED" },
    select: { id: true },
  });
  if (!due) throw new Error("Obligación no encontrada o no está asignada.");

  await prisma.taskRecurringDue.update({
    where: { id: dueId },
    data: { status: "PENDING_ASSIGNMENT", assignedCleaningId: null, assignedAt: null },
  });
}
