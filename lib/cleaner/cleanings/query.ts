// lib/cleaner/cleanings/query.ts
// Query layer canónico para limpiezas del Cleaner/TL
// Source of truth único para visibilidad, clasificación, filtros y contadores

import prisma from "@/lib/prisma";
import { resolveCleanerContext, CleanerContext } from "../resolveCleanerContext";
import { getAccessiblePropertiesAndTenants } from "../getAccessiblePropertiesAndTenants";
import { getActiveMembershipsForUser } from "../getActiveMembershipsForUser";
import { getAvailabilityStartDate } from "../availabilityWindow";

export interface CleanerScope {
  propertyIds: string[];
  tenantIds: string[]; // hostTenantIds cuando hay WGE, servicesTenantIds cuando hay PropertyTeam
  teamIds: string[];
  membershipIds: string[];
  legacyMemberId: string | null;
  mode: "membership" | "legacy";
}

export interface CleanerCleaningsQueryParams {
  scope?: "assigned" | "available" | "upcoming" | "history" | "all";
  status?: string[]; // ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"]
  propertyId?: string;
  scheduledDateFrom?: Date;
  scheduledDateTo?: Date;
  includeCompleted?: boolean; // Para "Todas" vs solo activas
}

export interface CleanerCleaningsCounts {
  assignedToMeCount: number; // Asignadas a mí, status PENDING o IN_PROGRESS
  availableCount: number; // OPEN, sin asignar, futuras
  upcoming7dCount: number; // Asignadas a mí, próximos 7 días, status PENDING o IN_PROGRESS
  historyCount?: number; // COMPLETED asignadas a mí
}

/**
 * Obtiene el scope canónico del cleaner (propiedades y tenants accesibles)
 */
export async function getCleanerScope(
  context?: CleanerContext,
  includeRemoved: boolean = false
): Promise<CleanerScope> {
  const ctx = context || (await resolveCleanerContext());

  if (ctx.mode === "membership") {
    const teamIds = ctx.teamIds;
    if (teamIds.length === 0) {
      return {
        propertyIds: [],
        tenantIds: [],
        teamIds: [],
        membershipIds: [],
        legacyMemberId: null,
        mode: "membership",
      };
    }

    // Usar helper canónico para obtener propiedades y tenantIds
    const { propertyIds, tenantIds } = await getAccessiblePropertiesAndTenants(ctx.user.id, teamIds);

    const membershipsAccess = await getActiveMembershipsForUser(
      ctx.user.id,
      includeRemoved ? ["ACTIVE", "REMOVED"] : ["ACTIVE"]
    );
    const membershipIds = membershipsAccess.membershipIds;

    return {
      propertyIds,
      tenantIds,
      teamIds,
      membershipIds,
      legacyMemberId: null,
      mode: "membership",
    };
  } else {
    // Legacy mode
    if (!ctx.legacyMember) {
      return {
        propertyIds: [],
        tenantIds: [],
        teamIds: [],
        membershipIds: [],
        legacyMemberId: null,
        mode: "legacy",
      };
    }

    const legacyTeam = await prisma.team.findUnique({
      where: { id: ctx.legacyMember.teamId },
      select: { tenantId: true },
    });

    if (!legacyTeam?.tenantId) {
      return {
        propertyIds: [],
        tenantIds: [],
        teamIds: [],
        membershipIds: [],
        legacyMemberId: null,
        mode: "legacy",
      };
    }

    // Obtener propiedades vía PropertyTeam (legacy)
    const propertyTeams = await (prisma as any).propertyTeam.findMany({
      where: {
        tenantId: legacyTeam.tenantId,
        teamId: ctx.legacyMember.teamId,
      },
      select: {
        propertyId: true,
        property: {
          select: {
            id: true,
            isActive: true,
          },
        },
      },
    });

    const propertyIds = propertyTeams
      .filter((pt: any) => pt.property?.isActive !== false)
      .map((pt: any) => pt.propertyId);

    return {
      propertyIds,
      tenantIds: [legacyTeam.tenantId],
      teamIds: [ctx.legacyMember.teamId],
      membershipIds: [],
      legacyMemberId: ctx.legacyMember.id,
      mode: "legacy",
    };
  }
}

/**
 * Construye el whereClause base para queries de limpiezas
 */
function buildBaseWhereClause(
  scope: CleanerScope,
  params: CleanerCleaningsQueryParams
): any {
  const whereClause: any = {};

  // Para scopes no relacionados con historial, aplicar filtros de acceso actual (tenant/property)
  if (params.scope !== "history") {
    whereClause.tenantId = { in: scope.tenantIds };
    whereClause.propertyId = { in: scope.propertyIds };
  }

  // Filtro por fecha
  if (params.scheduledDateFrom || params.scheduledDateTo) {
    whereClause.scheduledDate = {};
    if (params.scheduledDateFrom) {
      whereClause.scheduledDate.gte = params.scheduledDateFrom;
    }
    if (params.scheduledDateTo) {
      whereClause.scheduledDate.lte = params.scheduledDateTo;
    }
  }

  // Filtro por propiedad específica
  if (params.propertyId) {
    whereClause.propertyId = params.propertyId;
  }

  // Clasificación según scope
  if (params.scope === "assigned" || params.scope === "upcoming") {
    // Mis limpiezas asignadas
    if (scope.mode === "membership") {
      whereClause.assignedMembershipId = { in: scope.membershipIds };
    } else {
      if (scope.legacyMemberId) {
        whereClause.assignedMemberId = scope.legacyMemberId;
      } else {
        // No hay legacy member, retornar vacío
        whereClause.id = "impossible-id";
      }
    }
    whereClause.assignmentStatus = "ASSIGNED";
  } else if (params.scope === "available") {
    // Disponibles (OPEN, sin asignar)
    whereClause.assignmentStatus = "OPEN";
    whereClause.assignedMembershipId = null;
    whereClause.assignedMemberId = null;
  } else if (params.scope === "history") {
    // Historial (COMPLETED o CANCELLED)
    if (scope.mode === "membership") {
      whereClause.assignedMembershipId = { in: scope.membershipIds };
    } else {
      if (scope.legacyMemberId) {
        whereClause.assignedMemberId = scope.legacyMemberId;
      } else {
        whereClause.id = "impossible-id";
      }
    }
    // Historial solo incluye COMPLETED (o CANCELLED si se especifica)
    if (!params.status || !params.status.includes("CANCELLED")) {
      whereClause.status = "COMPLETED";
    }
  }
  // "all" no agrega filtros de asignación, solo los filtros base

  // Filtro por status (después de scope para que history pueda sobrescribir)
  if (params.status && params.status.length > 0) {
    whereClause.status = { in: params.status };
  } else if (params.scope === "assigned" || params.scope === "upcoming") {
    // Para "assigned" y "upcoming", solo incluir PENDING e IN_PROGRESS (como los counts)
    // A menos que includeCompleted=true
    if (params.includeCompleted) {
      whereClause.status = { in: ["PENDING", "IN_PROGRESS", "COMPLETED"] };
    } else {
      whereClause.status = { in: ["PENDING", "IN_PROGRESS"] };
    }
  } else if (params.scope !== "history") {
    // Por defecto, excluir CANCELLED (excepto en history que ya está filtrado)
    if (params.includeCompleted) {
      // Para "Todas" incluir PENDING, IN_PROGRESS, COMPLETED
      whereClause.status = { in: ["PENDING", "IN_PROGRESS", "COMPLETED"] };
    } else {
      // Solo activas
      whereClause.status = { not: "CANCELLED" };
    }
  }

  return whereClause;
}

/**
 * Helper interno: obtiene el inicio del día local (00:00:00)
 */
function startOfTodayLocal(now: Date): Date {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  return startOfToday;
}

/**
 * Obtiene lista de limpiezas con filtros consistentes
 */
export async function getCleanerCleaningsList(
  params: CleanerCleaningsQueryParams = {},
  context?: CleanerContext
): Promise<{ cleanings: any[]; scope: CleanerScope }> {
  const includeRemoved = params.scope === "history" || params.scope === "all";
  const scope = await getCleanerScope(context, includeRemoved);

  if (scope.propertyIds.length === 0 || scope.tenantIds.length === 0) {
    return { cleanings: [], scope };
  }

  const whereClause = buildBaseWhereClause(scope, params);

  // Para "upcoming", agregar filtro de fecha (próximos 7 días desde inicio del día)
  if (params.scope === "upcoming") {
    const now = new Date();
    const startOfToday = startOfTodayLocal(now);
    const sevenDaysLater = new Date();
    sevenDaysLater.setDate(now.getDate() + 7);
    sevenDaysLater.setHours(23, 59, 59, 999);
    whereClause.scheduledDate = {
      gte: startOfToday,
      lte: sevenDaysLater,
    };
  }

  // Para "available", solo futuras (desde availabilityStart)
  // Pero respetar scheduledDateFrom si se proporciona (para rangos específicos)
  if (params.scope === "available") {
    const availabilityStart = getAvailabilityStartDate(new Date());
    if (!whereClause.scheduledDate) {
      whereClause.scheduledDate = {};
    }
    // Si se proporciona scheduledDateFrom, usar el máximo entre availabilityStart y scheduledDateFrom
    if (params.scheduledDateFrom) {
      whereClause.scheduledDate.gte = params.scheduledDateFrom > availabilityStart 
        ? params.scheduledDateFrom 
        : availabilityStart;
    } else {
      whereClause.scheduledDate.gte = availabilityStart;
    }
  }

  const cleanings = await (prisma as any).cleaning.findMany({
    where: whereClause,
    include: {
      property: {
        select: {
          id: true,
          name: true,
          shortName: true,
          coverAssetGroupId: true,
        },
      },
      assignedMember: {
        include: {
          team: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      TeamMembership: {
        include: {
          User: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
    orderBy: {
      scheduledDate: "asc",
    },
  });

  return { cleanings, scope };
}

/**
 * Obtiene contadores para las cards del dashboard
 * Usa EXACTAMENTE la misma lógica que getCleanerCleaningsList
 */
export async function getCleanerCleaningsCounts(
  context?: CleanerContext
): Promise<CleanerCleaningsCounts> {
  const scope = await getCleanerScope(context);

  if (scope.propertyIds.length === 0 || scope.tenantIds.length === 0) {
    return {
      assignedToMeCount: 0,
      availableCount: 0,
      upcoming7dCount: 0,
      historyCount: 0,
    };
  }

  const now = new Date();
  const startOfToday = startOfTodayLocal(now);
  const sevenDaysLater = new Date();
  sevenDaysLater.setDate(now.getDate() + 7);
  sevenDaysLater.setHours(23, 59, 59, 999);
  const availabilityStart = getAvailabilityStartDate(now);

  // Base where para todas las queries
  const baseWhere: any = {
    tenantId: { in: scope.tenantIds },
    propertyId: { in: scope.propertyIds },
  };

  // 1. Asignadas a mí (PENDING o IN_PROGRESS)
  const assignedWhere = {
    ...baseWhere,
    assignmentStatus: "ASSIGNED",
    status: { in: ["PENDING", "IN_PROGRESS"] },
  };
  if (scope.mode === "membership") {
    assignedWhere.assignedMembershipId = { in: scope.membershipIds };
  } else {
    if (scope.legacyMemberId) {
      assignedWhere.assignedMemberId = scope.legacyMemberId;
    } else {
      assignedWhere.id = "impossible-id";
    }
  }
  const assignedToMeCount = await (prisma as any).cleaning.count({
    where: assignedWhere,
  });

  // 2. Disponibles (OPEN, sin asignar, futuras)
  const availableWhere = {
    ...baseWhere,
    assignmentStatus: "OPEN",
    assignedMembershipId: null,
    assignedMemberId: null,
    status: { not: "CANCELLED" },
    scheduledDate: { gte: availabilityStart },
  };
  const availableCount = await (prisma as any).cleaning.count({
    where: availableWhere,
  });

  // 3. Próximas 7 días (asignadas a mí, PENDING o IN_PROGRESS, desde inicio del día)
  const upcomingWhere = {
    ...baseWhere,
    assignmentStatus: "ASSIGNED",
    status: { in: ["PENDING", "IN_PROGRESS"] },
    scheduledDate: {
      gte: startOfToday,
      lte: sevenDaysLater,
    },
  };
  if (scope.mode === "membership") {
    upcomingWhere.assignedMembershipId = { in: scope.membershipIds };
  } else {
    if (scope.legacyMemberId) {
      upcomingWhere.assignedMemberId = scope.legacyMemberId;
    } else {
      upcomingWhere.id = "impossible-id";
    }
  }
  const upcoming7dCount = await (prisma as any).cleaning.count({
    where: upcomingWhere,
  });

  // 4. Historial (COMPLETED asignadas a mí)
  const historyWhere = {
    ...baseWhere,
    status: "COMPLETED",
  };
  if (scope.mode === "membership") {
    historyWhere.assignedMembershipId = { in: scope.membershipIds };
  } else {
    if (scope.legacyMemberId) {
      historyWhere.assignedMemberId = scope.legacyMemberId;
    } else {
      historyWhere.id = "impossible-id";
    }
  }
  const historyCount = await (prisma as any).cleaning.count({
    where: historyWhere,
  });

  return {
    assignedToMeCount,
    availableCount,
    upcoming7dCount,
    historyCount,
  };
}

