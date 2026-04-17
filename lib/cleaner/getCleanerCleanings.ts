// lib/cleaner/getCleanerCleanings.ts
import prisma from "@/lib/prisma";
import { resolveCleanerContext, CleanerContext } from "./resolveCleanerContext";
import { getAccessiblePropertiesAndTenants } from "./getAccessiblePropertiesAndTenants";

export interface CleaningFilters {
  status?: string[];
  assignmentStatus?: string[];
  scheduledDateFrom?: Date;
  scheduledDateTo?: Date;
  assignedOnly?: boolean; // Si true, solo limpiezas asignadas al cleaner
}

/**
 * Obtiene limpiezas para el cleaner actual
 * Usa TeamMembership si existe, fallback a TeamMember legacy
 * 
 * @param context - Contexto del cleaner (opcional, si no se provee se resuelve internamente)
 */
export async function getCleanerCleanings(filters: CleaningFilters = {}, context?: CleanerContext) {
  try {
    // OPTIMIZACIÓN: Si el contexto ya está resuelto, reutilizarlo para evitar queries duplicadas
    let resolvedContext: CleanerContext;
    if (context) {
      resolvedContext = context;
    } else {
      resolvedContext = await resolveCleanerContext();
    }
    if (resolvedContext.mode === "membership") {
      // Modo membership: filtrar por teamIds de memberships
      const teamIds = resolvedContext.teamIds;

      if (teamIds.length === 0) {
        return { cleanings: [], context: resolvedContext };
      }

      // Obtener propiedades accesibles y tenantIds correctos usando helper canónico
      const { propertyIds, tenantIds: cleaningTenantIds } =
        await getAccessiblePropertiesAndTenants(resolvedContext.user.id, teamIds);

      if (propertyIds.length === 0 || cleaningTenantIds.length === 0) {
        return { cleanings: [], context: resolvedContext };
      }

      const whereClause: any = {
        tenantId: { in: cleaningTenantIds },
        propertyId: { in: propertyIds },
      };

      // Aplicar filtros de status
      if (filters.status && filters.status.length > 0) {
        whereClause.status = { in: filters.status };
      }

      // Aplicar filtros de assignmentStatus
      if (filters.assignmentStatus && filters.assignmentStatus.length > 0) {
        whereClause.assignmentStatus = { in: filters.assignmentStatus };
      }

      // Aplicar filtros de fecha
      if (filters.scheduledDateFrom || filters.scheduledDateTo) {
        whereClause.scheduledDate = {};
        if (filters.scheduledDateFrom) {
          whereClause.scheduledDate.gte = filters.scheduledDateFrom;
        }
        if (filters.scheduledDateTo) {
          whereClause.scheduledDate.lte = filters.scheduledDateTo;
        }
      }

      // Si assignedOnly=true, filtrar por assignedMembershipId en membership mode
      if (filters.assignedOnly) {
        const activeMembershipIds = resolvedContext.memberships.map((m) => m.id);
        if (activeMembershipIds.length > 0) {
          whereClause.assignedMembershipId = { in: activeMembershipIds };
        } else {
          // Si no hay memberships activos, no hay limpiezas asignadas
          return { cleanings: [], context: resolvedContext };
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

      return { cleanings, context: resolvedContext };
    } else {
      // Modo legacy: usar lógica actual con TeamMember
      if (!resolvedContext.legacyMember || !resolvedContext.legacyMember.teamId) {
        return { cleanings: [], context: resolvedContext };
      }

      const legacyTeam = await prisma.team.findUnique({
        where: { id: resolvedContext.legacyMember.teamId },
        select: { tenantId: true },
      });
      const legacyTenantId = legacyTeam?.tenantId || null;
      if (!legacyTenantId) {
        return { cleanings: [], context: resolvedContext };
      }

      // Obtener propiedades del team del member legacy
      const propertyTeams = await (prisma as any).propertyTeam.findMany({
        where: {
          tenantId: legacyTenantId,
          teamId: resolvedContext.legacyMember.teamId,
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

      if (propertyIds.length === 0) {
        return { cleanings: [], context: resolvedContext };
      }

      const whereClause: any = {
        tenantId: legacyTenantId,
        propertyId: { in: propertyIds },
      };

      // Aplicar filtros
      if (filters.status && filters.status.length > 0) {
        whereClause.status = { in: filters.status };
      }

      if (filters.assignmentStatus && filters.assignmentStatus.length > 0) {
        whereClause.assignmentStatus = { in: filters.assignmentStatus };
      }

      if (filters.scheduledDateFrom || filters.scheduledDateTo) {
        whereClause.scheduledDate = {};
        if (filters.scheduledDateFrom) {
          whereClause.scheduledDate.gte = filters.scheduledDateFrom;
        }
        if (filters.scheduledDateTo) {
          whereClause.scheduledDate.lte = filters.scheduledDateTo;
        }
      }

      // En legacy mode, si assignedOnly=true, no hay membershipId — retornar vacío
      if (filters.assignedOnly) {
        return { cleanings: [], context: resolvedContext };
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
        },
        orderBy: {
          scheduledDate: "asc",
        },
      });

      return { cleanings, context: resolvedContext };
    }
  } catch (error: any) {
    // Si no hay membership ni legacy, retornar lista vacía
    return { cleanings: [], context: null };
  }
}

/**
 * Obtiene limpiezas asignadas al cleaner actual
 * En membership mode: todas las limpiezas del team filtradas por assignedMembershipId
 * En legacy mode: no hay memberships — retorna vacío si assignedOnly=true
 */
export async function getAssignedCleanerCleanings(filters: CleaningFilters = {}) {
  const result = await getCleanerCleanings({
    ...filters,
    assignedOnly: true,
  });
  return result;
}

/**
 * Obtiene limpiezas disponibles (OPEN) para el cleaner actual
 */
export async function getAvailableCleanerCleanings(filters: CleaningFilters = {}) {
  const result = await getCleanerCleanings({
    ...filters,
    assignmentStatus: ["OPEN"],
  });
  return result;
}

