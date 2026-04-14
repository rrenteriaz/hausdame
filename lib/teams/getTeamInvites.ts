import { getInviteLink } from "@/lib/invites/links";
import prisma from "@/lib/prisma";
import type { User } from "@/lib/generated/prisma";

export type TeamInviteItem = {
  id: string;
  token: string;
  status: "PENDING" | "CLAIMED" | "EXPIRED" | "REVOKED";
  prefillName: string | null;
  createdAt: string;
  expiresAt: string;
  claimedAt: string | null;
  inviteLink: string;
};

const HOST_ROLES = ["OWNER", "ADMIN", "MANAGER", "AUXILIAR"] as const;

export async function getTeamInvites(args: {
  teamId: string;
  viewer: Pick<User, "id" | "role" | "tenantId">;
  baseUrl?: string;
  take?: number;
}): Promise<TeamInviteItem[]> {
  const { teamId, viewer, baseUrl, take = 20 } = args;

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      tenantId: true,
    },
  });

  if (!team) {
    throw new Error("Team no encontrado");
  }

  const isHost = HOST_ROLES.includes(viewer.role as (typeof HOST_ROLES)[number]);
  if (isHost) {
    if (viewer.tenantId !== team.tenantId) {
      throw new Error("No tienes permiso para acceder a este team");
    }
  } else {
    const membership = await prisma.teamMembership.findUnique({
      where: {
        teamId_userId: {
          teamId,
          userId: viewer.id,
        },
      },
      select: {
        role: true,
        status: true,
      },
    });

    const allowed =
      !!membership &&
      membership.status === "ACTIVE" &&
      membership.role === "TEAM_LEADER";

    if (!allowed) {
      throw new Error("No tienes permiso para acceder a este team");
    }
  }

  const invites = await prisma.teamInvite.findMany({
    where: { teamId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      token: true,
      status: true,
      prefillName: true,
      createdAt: true,
      expiresAt: true,
      claimedAt: true,
    },
  });

  const now = new Date();

  return invites.map((invite) => {
    const isExpired = invite.status === "PENDING" && invite.expiresAt < now;
    return {
      id: invite.id,
      token: invite.token,
      status: (isExpired ? "EXPIRED" : invite.status) as TeamInviteItem["status"],
      prefillName: invite.prefillName,
      createdAt: invite.createdAt.toISOString(),
      expiresAt: invite.expiresAt.toISOString(),
      claimedAt: invite.claimedAt?.toISOString() || null,
      inviteLink: getInviteLink(invite.token, "team", baseUrl),
    };
  });
}

