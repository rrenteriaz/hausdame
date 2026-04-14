import prisma from "@/lib/prisma";
import type {
  PrismaClient,
  Prisma,
  PropertyAccessRole,
  PropertyMemberAccessStatus,
} from "@/lib/generated/prisma";

type DbClient = PrismaClient | Prisma.TransactionClient;

function assertExactlyOneIdentity(args: {
  teamMembershipId?: string | null;
  userId?: string | null;
}) {
  const hasTeamMembership = !!args.teamMembershipId;
  const hasUser = !!args.userId;
  if (hasTeamMembership === hasUser) {
    throw new Error("PropertyMemberAccess debe tener exactamente un identity");
  }
}

/**
 * CONTRACT: docs/contracts/CONTRATO DE INVITACIONES HOST-PROPERTY (CLEANER + MANAGER).md
 * Idempotente por @@unique([propertyId, userId]).
 */
export async function ensurePropertyUserAccess(args: {
  propertyId: string;
  userId: string;
  accessRole: PropertyAccessRole;
  status?: PropertyMemberAccessStatus;
  db?: DbClient;
}) {
  const db = args.db ?? prisma;
  assertExactlyOneIdentity({ userId: args.userId });

  const status = args.status ?? "ACTIVE";
  const existing = await db.propertyMemberAccess.findUnique({
    where: {
      propertyId_userId: {
        propertyId: args.propertyId,
        userId: args.userId,
      },
    },
    select: { id: true, accessRole: true, status: true },
  });

  if (existing) {
    if (existing.accessRole && existing.accessRole !== args.accessRole) {
      throw new Error("Conflicto de rol de acceso en la propiedad");
    }
    if (existing.status !== status) {
      return db.propertyMemberAccess.update({
        where: { id: existing.id },
        data: {
          status,
          teamMembershipId: null,
        },
      });
    }
    return db.propertyMemberAccess.update({
      where: { id: existing.id },
      data: {
        teamMembershipId: null,
      },
    });
  }

  return db.propertyMemberAccess.create({
    data: {
      propertyId: args.propertyId,
      userId: args.userId,
      accessRole: args.accessRole,
      status,
    },
  });
}

/**
 * CONTRACT: docs/contracts/CONTRATO DE TENANTS Y TEAMS (SERVICE-CLEANER).md
 * Idempotente por @@unique([propertyId, teamMembershipId]).
 */
export async function ensurePropertyMembershipAccess(args: {
  propertyId: string;
  teamMembershipId: string;
  status?: PropertyMemberAccessStatus;
  db?: DbClient;
}) {
  const db = args.db ?? prisma;
  assertExactlyOneIdentity({ teamMembershipId: args.teamMembershipId });

  const status = args.status ?? "ACTIVE";
  return db.propertyMemberAccess.upsert({
    where: {
      propertyId_teamMembershipId: {
        propertyId: args.propertyId,
        teamMembershipId: args.teamMembershipId,
      },
    },
    update: {
      status,
      userId: null,
      accessRole: null,
    },
    create: {
      propertyId: args.propertyId,
      teamMembershipId: args.teamMembershipId,
      status,
    },
  });
}

