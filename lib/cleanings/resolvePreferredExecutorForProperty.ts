/**
 * Resuelve el ejecutor preferido configurado por el TL para una propiedad + equipo.
 *
 * El TL puede definir qué miembro de su equipo recibe automáticamente las limpiezas
 * de una propiedad específica mediante PropertyAssignmentConfig.
 */

import prisma from "@/lib/prisma";

export interface PreferredExecutorResult {
  membershipId: string;
  teamId: string;
}

/**
 * Retorna el ejecutor preferido para un par (propertyId, teamId).
 *
 * Retorna null si:
 * - No hay configuración de preferencia para ese par
 * - La membership preferida fue removida o está inactiva
 */
export async function resolvePreferredExecutorForProperty(
  propertyId: string,
  teamId: string
): Promise<PreferredExecutorResult | null> {
  const config = await prisma.propertyAssignmentConfig.findUnique({
    where: {
      propertyId_teamId: { propertyId, teamId },
    },
    select: {
      preferredMembershipId: true,
      teamId: true,
    },
  });

  if (!config) return null;

  // Validar que la membership sigue activa y pertenece al team correcto
  const membership = await prisma.teamMembership.findFirst({
    where: {
      id: config.preferredMembershipId,
      teamId,
      status: "ACTIVE",
    },
    select: { id: true, teamId: true },
  });

  if (!membership) return null;

  return {
    membershipId: membership.id,
    teamId: membership.teamId,
  };
}
