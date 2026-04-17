/**
 * Helper central de auto-asignación para nuevas limpiezas.
 *
 * Orden de decisión (contrato §AUTO-ASIGNACIÓN):
 * 1. Si existe preferredMembershipId válido para (propertyId, teamId) → asignar ese miembro
 * 2. Si no hay preferencia y hay exactamente 1 membership ACTIVE → auto-asignar
 * 3. Si hay 2+ memberships activas → OPEN (requiere selección manual)
 * 4. Si no hay memberships activas → OPEN + atención
 * 5. Si no hay teamId → OPEN + atención (NO_TEAM_CONFIGURED)
 *
 * INVARIANTE: assignedMembershipId != null implica teamId != null.
 * Este helper garantiza el invariante siempre.
 */

import prisma from "@/lib/prisma";
import { resolvePreferredExecutorForProperty } from "./resolvePreferredExecutorForProperty";

export interface AutoAssignmentResult {
  assignedMembershipId: string | null;
  teamId: string | null;
  assignmentStatus: "OPEN" | "ASSIGNED";
  needsAttention: boolean;
  attentionReason: string | null;
}

/**
 * Resuelve la asignación automática para una nueva limpieza.
 *
 * @param propertyId - ID de la propiedad
 * @param resolvedTeamId - teamId ya resuelto externamente (null si no hay team)
 */
export async function resolveAutoAssignment(
  propertyId: string,
  resolvedTeamId: string | null
): Promise<AutoAssignmentResult> {
  // Sin team → no hay asignación posible
  if (!resolvedTeamId) {
    return {
      assignedMembershipId: null,
      teamId: null,
      assignmentStatus: "OPEN",
      needsAttention: true,
      attentionReason: "NO_TEAM_CONFIGURED",
    };
  }

  // Paso 1: Verificar preferred executor configurado por el TL
  const preferred = await resolvePreferredExecutorForProperty(
    propertyId,
    resolvedTeamId
  );

  if (preferred) {
    return {
      assignedMembershipId: preferred.membershipId,
      teamId: resolvedTeamId,
      assignmentStatus: "ASSIGNED",
      needsAttention: false,
      attentionReason: null,
    };
  }

  // Pasos 2–4: Sin preferencia, evaluar memberships activas del equipo
  const activeMemberships = await prisma.teamMembership.findMany({
    where: {
      teamId: resolvedTeamId,
      status: "ACTIVE",
    },
    select: { id: true },
  });

  if (activeMemberships.length === 1) {
    // Exactamente 1 activa → auto-asignar
    return {
      assignedMembershipId: activeMemberships[0].id,
      teamId: resolvedTeamId,
      assignmentStatus: "ASSIGNED",
      needsAttention: false,
      attentionReason: null,
    };
  }

  if (activeMemberships.length === 0) {
    // Ninguna activa → atención requerida
    return {
      assignedMembershipId: null,
      teamId: resolvedTeamId,
      assignmentStatus: "OPEN",
      needsAttention: true,
      attentionReason: "NO_AVAILABLE_MEMBER",
    };
  }

  // 2+ activas → requiere selección manual por TL o Host
  return {
    assignedMembershipId: null,
    teamId: resolvedTeamId,
    assignmentStatus: "OPEN",
    needsAttention: false,
    attentionReason: null,
  };
}
