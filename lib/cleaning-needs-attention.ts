// lib/cleaning-needs-attention.ts
import prisma from "@/lib/prisma";
import { getEligibleMembersForCleaning } from "./cleaning-eligibility";

export type CleaningNeedsAttentionReason =
  | "NO_ASSIGNED_TEAM"
  | "NO_ASSIGNED_MEMBER"
  | "MEMBER_NOT_AVAILABLE";

export interface CleaningNeedsAttention {
  id: string;
  propertyId: string;
  scheduledDate: Date;
  status: string;
  assignedMembershipId?: string | null;
  property: {
    id: string;
    name: string;
    shortName: string | null;
    coverAssetGroupId: string | null;
  };
  assignedMemberId: string | null;
  assignedMember: {
    id: string;
    name: string;
    team: {
      id: string;
      name: string;
    };
  } | null;
  propertyTeamsCount: number;
  reason: CleaningNeedsAttentionReason;
}

/**
 * Obtiene las limpiezas que requieren atención por problemas de asignación de cleaner.
 * 
 * Una limpieza requiere atención si:
 * 1. No tiene cleaner asignado (assignedMemberId IS NULL)
 * 2. Tiene cleaner asignado pero no está disponible en el horario programado
 */
export async function getCleaningsNeedingAttention(
  tenantId: string,
  onlyFuture: boolean = true
): Promise<CleaningNeedsAttention[]> {
  const now = new Date();
  
  // Obtener todas las limpiezas activas (no canceladas ni completadas)
  const cleanings = await (prisma as any).cleaning.findMany({
    where: {
      tenantId,
      status: { not: "CANCELLED" },
      ...(onlyFuture ? { scheduledDate: { gte: now } } : {}),
    },
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
    },
    orderBy: {
      scheduledDate: "asc",
    },
  });

  const cleaningsNeedingAttention: CleaningNeedsAttention[] = [];
  const propertyIds = cleanings.map((c: { propertyId: string }) => c.propertyId);
  const useWorkGroupReads = process.env.WORKGROUP_READS_ENABLED === "1";
  const propertyTeamsCountMap = new Map<string, number>();

  if (propertyIds.length > 0 && useWorkGroupReads) {
    const uniquePropertyIds: string[] = Array.from(new Set(propertyIds)) as string[];
    const links = await prisma.hostWorkGroupProperty.findMany({
      where: {
        tenantId,
        propertyId: { in: uniquePropertyIds },
      },
      select: { propertyId: true, workGroupId: true },
    });

    const workGroupIds = Array.from(
      new Set(links.map((link) => link.workGroupId))
    );

    const executors = workGroupIds.length
      ? await prisma.workGroupExecutor.findMany({
          where: {
            hostTenantId: tenantId,
            status: "ACTIVE",
            workGroupId: { in: workGroupIds },
          },
          select: { workGroupId: true, teamId: true },
        })
      : [];

    const executorTeamsByWorkGroup = new Map<string, Set<string>>();
    for (const executor of executors) {
      if (!executorTeamsByWorkGroup.has(executor.workGroupId)) {
        executorTeamsByWorkGroup.set(executor.workGroupId, new Set());
      }
      executorTeamsByWorkGroup.get(executor.workGroupId)!.add(executor.teamId);
    }

    const workGroupsByProperty = new Map<string, string[]>();
    for (const link of links) {
      if (!workGroupsByProperty.has(link.propertyId)) {
        workGroupsByProperty.set(link.propertyId, []);
      }
      workGroupsByProperty.get(link.propertyId)!.push(link.workGroupId);
    }

    for (const propertyId of uniquePropertyIds) {
      const workGroupsForProperty = workGroupsByProperty.get(propertyId) ?? [];
      const teamIds = new Set<string>();
      for (const workGroupId of workGroupsForProperty) {
        const teams = executorTeamsByWorkGroup.get(workGroupId);
        if (teams) {
          for (const teamId of teams) {
            teamIds.add(teamId);
          }
        }
      }
      propertyTeamsCountMap.set(propertyId, teamIds.size);
    }
  }

  if (propertyIds.length > 0 && !useWorkGroupReads) {
    const propertyTeamsCountRows = await (prisma as any).propertyTeam.groupBy({
      by: ["propertyId"],
      where: { tenantId, propertyId: { in: propertyIds } },
      _count: { _all: true },
    });
    for (const row of propertyTeamsCountRows) {
      propertyTeamsCountMap.set(row.propertyId, row._count._all as number);
    }
  }

  // Fallback WGE: para propiedades con PropertyTeam count=0, verificar cobertura operativa
  // real vía hostWorkGroupProperty + workGroupExecutor ACTIVE.
  // Evita el falso positivo NO_ASSIGNED_TEAM cuando WORKGROUP_READS_ENABLED no está activo
  // pero la propiedad sí tiene cobertura real por WorkGroups.
  const wgeCoveredPropertyIds = new Set<string>();
  if (propertyIds.length > 0) {
    const uniquePropertyIds = Array.from(new Set(propertyIds)) as string[];
    const zeroCountIds = uniquePropertyIds.filter(
      (id) => (propertyTeamsCountMap.get(id) ?? 0) === 0
    );
    if (zeroCountIds.length > 0) {
      const wgeLinks = await prisma.hostWorkGroupProperty.findMany({
        where: { tenantId, propertyId: { in: zeroCountIds } },
        select: { propertyId: true, workGroupId: true },
      });
      const wgeWgIds = Array.from(new Set(wgeLinks.map((l) => l.workGroupId)));
      const activeExecutors = wgeWgIds.length
        ? await prisma.workGroupExecutor.findMany({
            where: { hostTenantId: tenantId, status: "ACTIVE", workGroupId: { in: wgeWgIds } },
            select: { workGroupId: true },
          })
        : [];
      const activeWgSet = new Set(activeExecutors.map((e) => e.workGroupId));
      for (const link of wgeLinks) {
        if (activeWgSet.has(link.workGroupId)) {
          wgeCoveredPropertyIds.add(link.propertyId);
        }
      }
    }
  }

  for (const cleaning of cleanings) {
    let reason: CleaningNeedsAttentionReason | null = null;
    const propertyTeamsCount = propertyTeamsCountMap.get(cleaning.propertyId) ?? 0;

    // Caso 0: Sin equipo asignado (prioridad más alta).
    // Solo aplica si tampoco existe cobertura operativa real vía WGE (fallback defensivo).
    if (propertyTeamsCount === 0 && !wgeCoveredPropertyIds.has(cleaning.propertyId)) {
      reason = "NO_ASSIGNED_TEAM";
    } else if (!cleaning.assignedMemberId && !cleaning.assignedMembershipId) {
      // Caso 1: Sin cleaner asignado
      reason = "NO_ASSIGNED_MEMBER";
    }
    // Caso 2 eliminado: MEMBER_NOT_AVAILABLE ya no clasifica una limpieza como sin confirmar.
    // Una limpieza con cleaner asignado (assignedMemberId o assignedMembershipId) está confirmada,
    // independientemente del horario configurado en TeamMemberScheduleDay.

    // Si tiene razón, agregar a la lista
    if (reason) {
      cleaningsNeedingAttention.push({
        id: cleaning.id,
        propertyId: cleaning.propertyId,
        scheduledDate: cleaning.scheduledDate,
        status: cleaning.status,
        property: cleaning.property,
        assignedMemberId: cleaning.assignedMemberId,
        assignedMembershipId: cleaning.assignedMembershipId ?? null,
        assignedMember: cleaning.assignedMember,
        propertyTeamsCount,
        reason,
      });
    }
  }

  return cleaningsNeedingAttention;
}

/**
 * Obtiene el conteo de limpiezas que requieren atención (para el banner).
 */
export async function getCleaningsNeedingAttentionCount(
  tenantId: string
): Promise<number> {
  const cleanings = await getCleaningsNeedingAttention(tenantId, true);
  return cleanings.length;
}

