/**
 * Helper para resolver el TL responsable de un equipo.
 *
 * El TL se determina por TeamMembership.role === "TEAM_LEADER" y status === "ACTIVE".
 * Es el responsable jerárquico implícito cuando no hay ejecutor específico asignado.
 *
 * IMPORTANTE: El TL NO es el ejecutor visible para el Host.
 * El ejecutor visible es assignedMembershipId.
 * El TL es el fallback operativo cuando assignedMembershipId === null.
 */

import prisma from "@/lib/prisma";

export interface TeamLeaderInfo {
  /** ID de la TeamMembership del TL */
  membershipId: string;
  /** ID del User del TL */
  userId: string;
  /** Role (siempre TEAM_LEADER) */
  role: string;
}

/**
 * Retorna la TeamMembership del TL activo de un equipo.
 *
 * Si hay múltiples TL configurados, retorna el más antiguo (por orden de creación).
 * Retorna null si no hay TL activo.
 */
export async function getResponsibleLeaderForTeam(
  teamId: string
): Promise<TeamLeaderInfo | null> {
  const leader = await prisma.teamMembership.findFirst({
    where: {
      teamId,
      role: "TEAM_LEADER",
      status: "ACTIVE",
    },
    select: {
      id: true,
      userId: true,
      role: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (!leader) return null;

  return {
    membershipId: leader.id,
    userId: leader.userId,
    role: leader.role,
  };
}
