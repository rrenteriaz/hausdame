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
  tenantIds: string[];
  teamIds: string[];
  membershipIds: string[];
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
  inProgressCount: number; // Asignadas a mí, status IN_PROGRESS
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

  const teamIds = ctx.mode === "membership" ? ctx.teamIds : (ctx.legacyMember ? [ctx.legacyMember.teamId] : []);

  if (teamIds.length === 0) {
    return { propertyIds: [], tenantIds: [], teamIds: [], membershipIds: [] };
  }

  const membershipsAccess = await getActiveMembershipsForUser(
    ctx.user.id,
    includeRemoved ? ["ACTIVE", "REMOVED"] : ["ACTIVE"]
  );

  let propertyIds: string[];
  let tenantIds: string[];

  if (ctx.mode === "membership") {
    const accessible = await getAccessiblePropertiesAndTenants(ctx.user.id, teamIds);
    propertyIds = accessible.propertyIds;
    tenantIds = accessible.tenantIds;
  } else {
    // Legacy context: resolve via PropertyTeam
    const legacyTeam = await prisma.team.findUnique({
      where: { id: teamIds[0] },
      select: { tenantId: true },
    });
    if (!legacyTeam?.tenantId) {
      return { propertyIds: [], tenantIds: [], teamIds: [], membershipIds: [] };
    }
    const propertyTeams = await (prisma as any).propertyTeam.findMany({
      where: { tenantId: legacyTeam.tenantId, teamId: teamIds[0] },
      select: { propertyId: true, property: { select: { id: true, isActive: true } } },
    });
    propertyIds = propertyTeams
      .filter((pt: any) => pt.property?.isActive !== false)
      .map((pt: any) => pt.propertyId);
    tenantIds = [legacyTeam.tenantId];
  }

  return {
    propertyIds,
    tenantIds,
    teamIds,
    membershipIds: membershipsAccess.membershipIds,
  };
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
    // Mis limpiezas asignadas — único modelo: membershipId
    if (scope.membershipIds.length > 0) {
      whereClause.assignedMembershipId = { in: scope.membershipIds };
    } else {
      whereClause.id = "impossible-id";
    }
    whereClause.assignmentStatus = "ASSIGNED";
  } else if (params.scope === "available") {
    // Disponibles (OPEN, sin ejecutor)
    whereClause.assignmentStatus = "OPEN";
    whereClause.assignedMembershipId = null;
  } else if (params.scope === "history") {
    // Historial (COMPLETED o CANCELLED)
    if (scope.membershipIds.length > 0) {
      whereClause.assignedMembershipId = { in: scope.membershipIds };
    } else {
      whereClause.id = "impossible-id";
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
 * Devuelve UTC midnight del día UTC en que cae `now`.
 * scheduledDate es @db.Date → almacenado como UTC midnight.
 * getUTC* garantiza el mismo resultado sin importar el TZ del runtime.
 */
function startOfDayUTC(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
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

  // Para "upcoming", agregar filtro de fecha (próximos 7 días desde inicio del día UTC).
  // Date.UTC con day+7 ajusta cruces de mes/año automáticamente.
  if (params.scope === "upcoming") {
    const now = new Date();
    whereClause.scheduledDate = {
      gte: startOfDayUTC(now),
      lte: new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 7,
        23, 59, 59, 999,
      )),
    };
  }

  // Para "available", solo futuras (desde availabilityStart)
  // Pero respetar scheduledDateFrom si se proporciona (para rangos específicos)
  if (params.scope === "available") {
    const availabilityStart = getAvailabilityStartDate(new Date(), { includePastOpen: true });
    if (!whereClause.scheduledDate) {
      whereClause.scheduledDate = {};
    }
    // Si se proporciona scheduledDateFrom, usar el máximo entre availabilityStart y scheduledDateFrom
    if (params.scheduledDateFrom) {
      whereClause.scheduledDate.gte =
        params.scheduledDateFrom > availabilityStart ? params.scheduledDateFrom : availabilityStart;
    } else {
      whereClause.scheduledDate.gte = availabilityStart;
    }

    // Restricción de negocio: solo PENDING son reclamables (no IN_PROGRESS, COMPLETED o CANCELLED)
    whereClause.status = "PENDING";
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
      inProgressCount: 0,
      upcoming7dCount: 0,
      historyCount: 0,
    };
  }

  const now = new Date();
  const startOfToday = startOfDayUTC(now);
  const sevenDaysLater = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 7,
    23, 59, 59, 999,
  ));
  const availabilityStart = getAvailabilityStartDate(now, { includePastOpen: true });

  // Base where para todas las queries
  const baseWhere: any = {
    tenantId: { in: scope.tenantIds },
    propertyId: { in: scope.propertyIds },
  };

  const membershipFilter = scope.membershipIds.length > 0
    ? { assignedMembershipId: { in: scope.membershipIds } }
    : { id: "impossible-id" };

  // 1. Asignadas a mí (PENDING o IN_PROGRESS)
  const assignedToMeCount = await (prisma as any).cleaning.count({
    where: {
      ...baseWhere,
      ...membershipFilter,
      assignmentStatus: "ASSIGNED",
      status: { in: ["PENDING", "IN_PROGRESS"] },
    },
  });

  // 2. Disponibles (OPEN, sin asignar, ventanas permitidas)
  const availableCount = await (prisma as any).cleaning.count({
    where: {
      ...baseWhere,
      assignmentStatus: "OPEN",
      assignedMembershipId: null,
      status: "PENDING",
      scheduledDate: { gte: availabilityStart },
    },
  });

  // 3. Próximas 7 días (asignadas a mí, PENDING o IN_PROGRESS, desde inicio del día)
  const upcoming7dCount = await (prisma as any).cleaning.count({
    where: {
      ...baseWhere,
      ...membershipFilter,
      assignmentStatus: "ASSIGNED",
      status: { in: ["PENDING", "IN_PROGRESS"] },
      scheduledDate: { gte: startOfToday, lte: sevenDaysLater },
    },
  });

  // 4. En progreso (IN_PROGRESS asignadas a mí)
  const inProgressCount = await (prisma as any).cleaning.count({
    where: {
      ...baseWhere,
      ...membershipFilter,
      assignmentStatus: "ASSIGNED",
      status: "IN_PROGRESS",
    },
  });

  // 5. Historial (COMPLETED asignadas a mí)
  const historyCount = await (prisma as any).cleaning.count({
    where: {
      ...baseWhere,
      ...membershipFilter,
      status: "COMPLETED",
    },
  });

  return {
    assignedToMeCount,
    availableCount,
    upcoming7dCount,
    inProgressCount,
    historyCount,
  };
}

