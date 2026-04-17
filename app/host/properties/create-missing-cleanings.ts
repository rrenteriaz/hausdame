/**
 * Server Action para crear limpiezas faltantes para reservas CONFIRMED existentes
 */

"use server";

import prisma from "@/lib/prisma";
import { requireHostUser } from "@/lib/auth/requireUser";
import { revalidatePath } from "next/cache";
import { createChecklistSnapshotForCleaning } from "@/lib/checklist-snapshot";
import { resolveAutoAssignment } from "@/lib/cleanings/resolveAutoAssignment";
import { buildCleaningScheduledDate } from "@/lib/datetime/buildCleaningScheduledDate";
import { assertValidScheduledDate, assertAssignmentCoherence } from "@/lib/cleanings/assertCleaningInvariants";
import { resolveAvailableTeamsForProperty } from "@/lib/workgroups/resolveAvailableTeamsForProperty";
// FASE 4: propertyId ahora es el nuevo PK directamente, no necesitamos helper

function calculateCleaningDate(endDate: Date, checkOutTime: string | null | undefined): Date {
  let hours = 11; // Default 11:00
  let minutes = 0;

  if (checkOutTime) {
    const [h, m] = checkOutTime.split(":").map(Number);
    if (!isNaN(h)) hours = h;
    if (!isNaN(m)) minutes = m;
  }

  // endDate viene de Prisma: almacenado como UTC midnight via iCal sync.
  // Extraer día en UTC para obtener el día calendario correcto,
  // luego aplicar hora operativa en CDMX via buildCleaningScheduledDate.
  return buildCleaningScheduledDate(
    endDate.getUTCFullYear(),
    endDate.getUTCMonth(),
    endDate.getUTCDate(),
    hours,
    minutes
  );
}

export async function createMissingCleaningsForReservations(): Promise<{
  created: number;
  errors: string[];
}> {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  const result = {
    created: 0,
    errors: [] as string[],
  };

  try {
    console.log("[createMissingCleaningsForReservations] Buscando reservas CONFIRMED sin limpieza...");

    // Obtener todas las reservas CONFIRMED de iCal
    const confirmedReservations = await (prisma as any).reservation.findMany({
      where: {
        tenantId,
        status: "CONFIRMED",
        source: "ICAL",
      },
      include: {
        property: {
          select: {
            id: true,
            checkOutTime: true,
          },
        },
        cleanings: true,
      },
    });

    console.log(`[createMissingCleaningsForReservations] Encontradas ${confirmedReservations.length} reservas CONFIRMED`);

    for (const reservation of confirmedReservations) {
      // Verificar si ya tiene limpieza
      if (reservation.cleanings && reservation.cleanings.length > 0) {
        console.log(`[createMissingCleaningsForReservations] Reserva ${reservation.id} ya tiene ${reservation.cleanings.length} limpieza(s)`);
        continue;
      }

      try {
        console.log(`[createMissingCleaningsForReservations] Creando limpieza para reserva ${reservation.id}`);

        const scheduledAtOriginal = calculateCleaningDate(
          reservation.endDate,
          reservation.property?.checkOutTime
        );

        // FASE 4: propertyId ahora es el nuevo PK directamente
        // Verificar que la propiedad existe y obtener información para snapshot
        const property = await prisma.property.findFirst({
          where: { id: reservation.propertyId, tenantId },
          select: {
            id: true,
            name: true,
            shortName: true,
            address: true,
          },
        });
        
        if (!property) {
          throw new Error(`Property not found for propertyId: ${reservation.propertyId}`);
        }

        // Resolver team de la propiedad (WGE + PropertyTeam legacy, sin flag)
        const { teamIds } = await resolveAvailableTeamsForProperty(tenantId, property.id);
        const resolvedTeamId = teamIds.length > 0 ? teamIds[0] : null;

        // Auto-asignación con preferred executor → 1 membership → OPEN
        const assignment = await resolveAutoAssignment(property.id, resolvedTeamId);

        assertValidScheduledDate(scheduledAtOriginal, "create-missing-cleanings");
        assertAssignmentCoherence({ assignedMembershipId: assignment.assignedMembershipId, needsAttention: assignment.needsAttention, attentionReason: assignment.attentionReason }, "create-missing-cleanings");

        const cleaning = await (prisma as any).cleaning.create({
          data: {
            tenantId,
            propertyId: property.id,
            reservationId: reservation.id,
            scheduledAtOriginal,
            scheduledAtPlanned: scheduledAtOriginal,
            scheduledDate: scheduledAtOriginal,
            status: "PENDING",
            assignmentStatus: assignment.assignmentStatus,
            teamId: assignment.teamId,
            assignedMembershipId: assignment.assignedMembershipId,
            needsAttention: assignment.needsAttention,
            attentionReason: assignment.attentionReason,
            propertyName: property.name,
            propertyShortName: property.shortName ?? null,
            propertyAddress: property.address ?? null,
          },
        });

        console.log("[assignment-model] create-missing-cleanings createCleaning", {
          cleaningId: cleaning.id,
          origin: "batch",
          teamId: assignment.teamId,
          assignedMembershipId: assignment.assignedMembershipId,
          assignmentStatus: assignment.assignmentStatus,
        });

        // FASE 4: Crear snapshot del checklist (usar propertyId)
        await createChecklistSnapshotForCleaning(
          tenantId,
          property.id, // FASE 4: propertyId ahora es el nuevo PK
          cleaning.id
        );

        console.log(`[createMissingCleaningsForReservations] ✅ Limpieza creada para reserva ${reservation.id}`);
        result.created++;
      } catch (error: any) {
        const errorMsg = `Error creando limpieza para reserva ${reservation.id}: ${error.message}`;
        console.error(`[createMissingCleaningsForReservations] ${errorMsg}`, error);
        result.errors.push(errorMsg);
      }
    }

    // Revalidar paths
    revalidatePath("/host/properties");
    revalidatePath("/host/cleanings");

    console.log(`[createMissingCleaningsForReservations] Completado: ${result.created} limpiezas creadas, ${result.errors.length} errores`);
    return result;
  } catch (error: any) {
    console.error("[createMissingCleaningsForReservations] Error:", error);
    result.errors.push(error.message || "Unknown error");
    return result;
  }
}

