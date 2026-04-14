import type { TeamRole, TeamMembershipStatus } from "@/lib/generated/prisma";
import prisma from "@/lib/prisma";

type UserLike = {
  id: string;
};

type MembershipLike = {
  userId: string;
  role: TeamRole;
  status: TeamMembershipStatus;
} | null;

/**
 * Determina si el usuario puede invitar miembros a un team (TL).
 *
 * Criterio:
 * - Debe existir TeamMembership ACTIVE del user en el team
 * - TeamMembership.role debe ser TEAM_LEADER
 *
 * Nota: En este proyecto no existe Tenant.ownerUserId / Team.createdByUserId,
 * así que usamos un criterio determinista con datos existentes.
 */
export function canInviteToTeam(args: {
  user: UserLike;
  membership: MembershipLike;
  leaderUserId: string | null;
}): boolean {
  const { user, membership, leaderUserId } = args;

  if (!membership) return false;
  if (membership.userId !== user.id) return false;
  if (membership.status !== "ACTIVE") return false;
  if (membership.role !== "TEAM_LEADER") return false;
  if (!leaderUserId) return false;

  return user.id === leaderUserId;
}

/**
 * Devuelve el userId del líder del team (TEAM_LEADER).
 */
export async function getLeaderUserIdForTeam(teamId: string): Promise<string | null> {
  const firstActive = await prisma.teamMembership.findFirst({
    where: { teamId, status: "ACTIVE", role: "TEAM_LEADER" },
    select: { userId: true },
  });

  return firstActive?.userId ?? null;
}

export async function isTeamLeader(userId: string, teamId: string): Promise<boolean> {
  const leaderUserId = await getLeaderUserIdForTeam(teamId);
  return !!leaderUserId && leaderUserId === userId;
}


