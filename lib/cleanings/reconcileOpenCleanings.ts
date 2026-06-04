/**
 * Servicio central de reconciliación de limpiezas OPEN sin asignación.
 *
 * Se ejecuta cuando cambia la elegibilidad operacional de una propiedad:
 * - Se asigna un WorkGroup a una propiedad
 * - Un ejecutor acepta una invitación al WG
 * - Se agrega/reactiva un ejecutor en un WG
 * - Después de un sync iCal (catch-all para limpiezas de syncs anteriores)
 *
 * INVARIANTES:
 * - Solo procesa: status=PENDING, assignmentStatus=OPEN, teamId=null
 * - Nunca toca: COMPLETED, CANCELLED, IN_PROGRESS
 * - No sobreescribe asignaciones con teamId ya seteado
 * - Es idempotente: reruns seguros
 * - Errors por propiedad son no-bloqueantes (logueados, no re-lanzados)
 *
 * CONTRATO DE AUTO-ASIGNACIÓN (§AUTO-ASIGNACIÓN):
 * - exactamente 1 equipo disponible → resolver con resolveAutoAssignment
 * - 0 equipos → sin cambios (sin team configurado)
 * - 2+ equipos → sin cambios (requiere selección manual del Host/TL)
 */

import prisma from "@/lib/prisma";
import { resolveAvailableTeamsForProperty } from "@/lib/workgroups/resolveAvailableTeamsForProperty";
import { resolveAutoAssignment } from "./resolveAutoAssignment";

export type ReconcileScope =
  | { type: "workgroup"; hostTenantId: string; workGroupId: string }
  | { type: "property"; hostTenantId: string; propertyId: string };

export interface ReconcileResult {
  propertiesProcessed: number;
  cleaningsAssigned: number;
  cleaningsSkipped: number;
}

const TAG = "[reconcileOpenCleanings]";

export async function reconcileOpenCleanings(
  scope: ReconcileScope
): Promise<ReconcileResult> {
  const result: ReconcileResult = {
    propertiesProcessed: 0,
    cleaningsAssigned: 0,
    cleaningsSkipped: 0,
  };

  const { hostTenantId } = scope;

  // 1. Resolver propertyIds según scope
  let propertyIds: string[];

  if (scope.type === "workgroup") {
    const links = await prisma.hostWorkGroupProperty.findMany({
      where: {
        tenantId: hostTenantId,
        workGroupId: scope.workGroupId,
        property: { isActive: true },
      },
      select: { propertyId: true },
    });
    propertyIds = links.map((l) => l.propertyId);
  } else {
    propertyIds = [scope.propertyId];
  }

  if (propertyIds.length === 0) {
    console.log(TAG, "no properties in scope", { scope });
    return result;
  }

  // 2. Pre-check: filtrar solo propiedades que tienen limpiezas OPEN candidatas.
  //    Evita llamar resolveAvailableTeams para propiedades sin trabajo pendiente.
  const candidates = await prisma.cleaning.groupBy({
    by: ["propertyId"],
    where: {
      tenantId: hostTenantId,
      propertyId: { in: propertyIds },
      status: "PENDING",
      assignmentStatus: "OPEN",
      teamId: null,
      assignedMembershipId: null,
    },
    _count: { id: true },
  });

  const propertiesWithCandidates = new Set(candidates.map((r) => r.propertyId));

  if (propertiesWithCandidates.size === 0) {
    console.log(TAG, "no OPEN cleanings to reconcile", { propertyIds });
    return result;
  }

  // 3. Procesar cada propiedad con limpiezas candidatas
  for (const propertyId of propertyIds) {
    if (!propertiesWithCandidates.has(propertyId)) continue;

    result.propertiesProcessed++;

    try {
      const { teamIds } = await resolveAvailableTeamsForProperty(
        hostTenantId,
        propertyId
      );

      // Contrato: exactamente 1 equipo → resolver; 0 o 2+ → skip
      const resolvedTeamId = teamIds.length === 1 ? teamIds[0] : null;
      const assignment = await resolveAutoAssignment(propertyId, resolvedTeamId);

      if (
        assignment.assignmentStatus !== "ASSIGNED" ||
        !assignment.teamId ||
        !assignment.assignedMembershipId
      ) {
        console.log(TAG, "skip — no eligible assignment", {
          propertyId,
          teamCount: teamIds.length,
          assignmentStatus: assignment.assignmentStatus,
          attentionReason: assignment.attentionReason,
        });
        result.cleaningsSkipped++;
        continue;
      }

      // Actualizar limpiezas OPEN sin asignación previa (idempotente por filtros)
      const updated = await prisma.cleaning.updateMany({
        where: {
          tenantId: hostTenantId,
          propertyId,
          status: "PENDING",
          assignmentStatus: "OPEN",
          teamId: null,
          assignedMembershipId: null,
          assignedMemberId: null,
        },
        data: {
          teamId: assignment.teamId,
          assignedMembershipId: assignment.assignedMembershipId,
          assignmentStatus: "ASSIGNED",
          needsAttention: false,
          attentionReason: null,
        },
      });

      result.cleaningsAssigned += updated.count;

      console.log(TAG, "assigned", {
        propertyId,
        teamId: assignment.teamId,
        assignedMembershipId: assignment.assignedMembershipId,
        count: updated.count,
      });
    } catch (err) {
      // Non-blocking: error en una propiedad no detiene el resto
      console.error(TAG, "error processing property", { propertyId, err });
    }
  }

  console.log(TAG, "done", result);
  return result;
}
