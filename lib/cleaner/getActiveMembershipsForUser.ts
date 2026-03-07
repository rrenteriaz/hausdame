import prisma from "@/lib/prisma";

export interface ActiveMembershipInfo {
  memberships: Array<{
    id: string;
    teamId: string;
    teamTenantId: string;
    teamStatus: "ACTIVE" | "INACTIVE";
  }>;
  membershipIds: string[];
  allTeamIds: string[];
  activeTeamIds: string[];
  tenantIds: string[];
}

export async function getActiveMembershipsForUser(
  userId: string,
  statuses: string[] = ["ACTIVE"]
): Promise<ActiveMembershipInfo> {
  const rows: any[] = await (prisma as any).teamMembership.findMany({
    where: { userId, status: { in: statuses } },
    select: {
      id: true,
      teamId: true,
      Team: {
        select: {
          tenantId: true,
          status: true,
        },
      },
    },
  });

  const memberships = rows.map((row) => ({
    id: row.id,
    teamId: row.teamId,
    teamTenantId: row.Team?.tenantId as string,
    teamStatus: (row.Team?.status ?? "ACTIVE") as "ACTIVE" | "INACTIVE",
  }));

  const membershipIds = Array.from(new Set(memberships.map((m) => m.id)));
  const allTeamIds = Array.from(new Set(memberships.map((m) => m.teamId)));
  const activeTeamIds = Array.from(
    new Set(memberships.filter((m) => m.teamStatus === "ACTIVE").map((m) => m.teamId))
  );
  const tenantIds = Array.from(new Set(memberships.map((m) => m.teamTenantId)));

  return { memberships, membershipIds, allTeamIds, activeTeamIds, tenantIds };
}

