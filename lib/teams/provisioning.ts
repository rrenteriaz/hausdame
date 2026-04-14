import prisma from "@/lib/prisma";
import type { PrismaClient, Prisma, TeamMembershipStatus, TeamRole } from "@/lib/generated/prisma";
import { assertServiceTenantById } from "@/lib/tenants/serviceTenant";

type DbClient = any;

type EnsureMembershipArgs = {
  teamId: string;
  userId: string;
  role: TeamRole;
  status: TeamMembershipStatus;
  forceRole?: boolean;
  db?: DbClient;
};

/**
 * CONTRACT: docs/contracts/CONTRATO DE TENANTS Y TEAMS (SERVICE-CLEANER).md
 * Idempotente. No crea duplicados por (teamId, userId).
 */
export async function ensureTeamMembership(args: EnsureMembershipArgs) {
  const db = args.db ?? prisma;
  const existing = await db.teamMembership.findUnique({
    where: {
      teamId_userId: {
        teamId: args.teamId,
        userId: args.userId,
      },
    },
  });

  if (existing) {
    const data: Partial<Pick<typeof existing, "status" | "role">> = {};
    if (existing.status !== args.status) {
      data.status = args.status;
    }
    if (args.forceRole && existing.role !== args.role) {
      data.role = args.role;
    }
    if (Object.keys(data).length > 0) {
      return db.teamMembership.update({
        where: { id: existing.id },
        data,
      });
    }
    return existing;
  }

  return db.teamMembership.create({
    data: {
      teamId: args.teamId,
      userId: args.userId,
      role: args.role,
      status: args.status,
    },
  });
}

type EnsurePersonalTeamArgs = {
  tenantId: string;
  cleanerUserId: string;
  db?: DbClient;
};

/**
 * CONTRACT: docs/contracts/CONTRATO DE TENANTS Y TEAMS (SERVICE-CLEANER).md
 * Asegura exactamente 1 team propio con TL ACTIVE en tenant SERVICE.
 */
export async function ensureCleanerPersonalTeam(args: EnsurePersonalTeamArgs) {
  const run = async (db: DbClient) => {
    await assertServiceTenantById(args.tenantId, db);

    const existingLeader = await db.teamMembership.findFirst({
      where: {
        userId: args.cleanerUserId,
        role: "TEAM_LEADER",
        status: "ACTIVE",
        Team: { tenantId: args.tenantId },
      },
      select: { id: true, teamId: true },
    });

    if (existingLeader) {
      return { teamId: existingLeader.teamId, membershipId: existingLeader.id };
    }

    const team = await db.team.upsert({
      where: {
        tenantId_name: {
          tenantId: args.tenantId,
          name: "Mi equipo",
        },
      },
      create: {
        tenantId: args.tenantId,
        name: "Mi equipo",
      },
      update: {},
      select: { id: true },
    });

    const membership = await ensureTeamMembership({
      teamId: team.id,
      userId: args.cleanerUserId,
      role: "TEAM_LEADER",
      status: "ACTIVE",
      forceRole: true,
      db,
    });

    return { teamId: team.id, membershipId: membership.id };
  };

  if (args.db) {
    return run(args.db);
  }

  return prisma.$transaction(async (tx) => run(tx));
}

