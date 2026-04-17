/**
 * Script para crear limpiezas faltantes para reservas CONFIRMED que no tienen limpieza asociada
 */

import prisma from "../lib/prisma";
import { getDefaultTenant } from "../lib/tenant";
import { getEligibleMembersForCleaning } from "../lib/cleaning-eligibility";
import { buildCleaningScheduledDate } from "../lib/datetime/buildCleaningScheduledDate";
import { assertValidScheduledDate } from "../lib/cleanings/assertCleaningInvariants";

function calculateCleaningDate(endDate: Date, checkOutTime: string | null | undefined): Date {
  let hours = 11; // Default 11:00
  let minutes = 0;

  if (checkOutTime) {
    const [h, m] = checkOutTime.split(":").map(Number);
    if (!isNaN(h)) hours = h;
    if (!isNaN(m)) minutes = m;
  }

  return buildCleaningScheduledDate(
    endDate.getUTCFullYear(),
    endDate.getUTCMonth(),
    endDate.getUTCDate(),
    hours,
    minutes
  );
}

async function createMissingCleanings() {
  const tenant = await getDefaultTenant();
  if (!tenant) {
    console.error("No tenant found");
    return;
  }

  console.log("Buscando reservas CONFIRMED sin limpieza asociada...");

  // Obtener todas las reservas CONFIRMED
  const confirmedReservations = await (prisma as any).reservation.findMany({
    where: {
      tenantId: tenant.id,
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

  console.log(`Encontradas ${confirmedReservations.length} reservas CONFIRMED`);

  let created = 0;
  let errors = 0;

  for (const reservation of confirmedReservations) {
    // Verificar si ya tiene limpieza
    if (reservation.cleanings && reservation.cleanings.length > 0) {
      console.log(`Reserva ${reservation.id} ya tiene ${reservation.cleanings.length} limpieza(s)`);
      continue;
    }

    try {
      console.log(`\nProcesando reserva ${reservation.id}:`);
      console.log(`  - Property: ${reservation.propertyId}`);
      console.log(`  - EndDate: ${reservation.endDate}`);
      console.log(`  - CheckOutTime: ${reservation.property?.checkOutTime || "null (default 11:00)"}`);

      const scheduledAtOriginal = calculateCleaningDate(
        reservation.endDate,
        reservation.property?.checkOutTime
      );

      assertValidScheduledDate(scheduledAtOriginal, "scripts/create-missing-cleanings");
      console.log(`  - Calculated cleaning date: ${scheduledAtOriginal.toISOString()}`);

      // Obtener miembros elegibles
      const eligibleMembers = await getEligibleMembersForCleaning(
        tenant.id,
        reservation.propertyId,
        scheduledAtOriginal
      );

      console.log(`  - Eligible members: ${eligibleMembers.length}`);

      let assignedMemberId: string | null = null;
      let assignmentStatus: "OPEN" | "ASSIGNED" = "OPEN";
      let needsAttention = false;
      let attentionReason: string | null = null;

      if (eligibleMembers.length === 1) {
        assignedMemberId = eligibleMembers[0].id;
        assignmentStatus = "ASSIGNED";
        console.log(`  - Auto-assigning to member: ${assignedMemberId}`);
      } else if (eligibleMembers.length === 0) {
        needsAttention = true;
        attentionReason = "NO_AVAILABLE_MEMBER";
        console.log(`  - No eligible members, marking needsAttention`);
      }

      const cleaning = await (prisma as any).cleaning.create({
        data: {
          tenantId: tenant.id,
          propertyId: reservation.propertyId,
          reservationId: reservation.id,
          scheduledAtOriginal,
          scheduledAtPlanned: scheduledAtOriginal,
          scheduledDate: scheduledAtOriginal,
          status: "PENDING",
          assignmentStatus,
          assignedMemberId,
          needsAttention,
          attentionReason,
        },
      });

      console.log(`  ✅ Limpieza creada: ${cleaning.id}`);
      created++;
    } catch (error: any) {
      console.error(`  ❌ Error creando limpieza para reserva ${reservation.id}:`, error.message);
      console.error(`  Stack:`, error.stack);
      errors++;
    }
  }

  console.log(`\n=== Resumen ===`);
  console.log(`Limpiezas creadas: ${created}`);
  console.log(`Errores: ${errors}`);
}

createMissingCleanings()
  .then(() => {
    console.log("\nScript completado");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error ejecutando script:", error);
    process.exit(1);
  });

