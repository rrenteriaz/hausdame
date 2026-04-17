// lib/cleaning-needs-attention.ts
import prisma from "@/lib/prisma";
import { getEligibleMembersForCleaning } from "./cleaning-eligibility";
import { hasEffectiveAssignee } from "./cleanings/getEffectiveAssignee";

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
 * 1. No tiene cleaner asignado (assignedMembershipId IS NULL)
 * 2. Tiene cleaner asignado pero no está disponible en el horario programado
 */
/**
 * Regla de negocio: ventana de días hacia atrás para mostrar limpiezas vencidas al Host.
 */
export const HOST_OVERDUE_WINDOW_DAYS = 45;

/**
 * Obtiene las limpiezas que requieren atención por problemas de asignación de cleaner.
 * 
 * Una limpieza requiere atención si:
 * 1. Está vencida (scheduledDate < hoy) y sigue OPEN o IN_PROGRESS sin asignar.
 * 2. No tiene cleaner asignado (assignedMembershipId IS NULL)
 * 3. Tiene inconsistencias críticas de asignación
 */
export async function getCleaningsNeedingAttention(
  tenantId: string,
  onlyFuture: boolean = true
): Promise<CleaningNeedsAttention[]> {
  const now = new Date();
  
  // Calcular el inicio de la ventana operativa (45 días atrás)
  const overdueStart = new Date(now);
  overdueStart.setDate(now.getDate() - HOST_OVERDUE_WINDOW_DAYS);
  overdueStart.setHours(0, 0, 0, 0);

  // Obtener todas las limpiezas activas (excluir canceladas y completadas)
  const cleanings = await (prisma as any).cleaning.findMany({
    where: {
      tenantId,
      status: { notIn: ["CANCELLED", "COMPLETED"] },
      scheduledDate: { 
        gte: onlyFuture ? now : overdueStart 
      },
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

  // ... (bloque de conteo de equipos se mantiene igual)
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
    const isOverdue = new Date(cleaning.scheduledDate) < now;
    const isUnassigned = !hasEffectiveAssignee(cleaning);

    // Regla de inclusión:
    // 0. Guardia canónica: si ya tiene ejecutor efectivo (assignedMembershipId != null)
    //    la limpieza está resuelta — nunca entra en ninguna categoría de alerta,
    //    independientemente de propertyTeamsCount u otros flags.
    // 1. PENDING sin ejecutor: sin equipo configurado → NO_ASSIGNED_TEAM;
    //    con equipo pero sin miembro → NO_ASSIGNED_MEMBER.
    // 2. IN_PROGRESS sin ejecutor: caso crítico → NO_ASSIGNED_MEMBER.

    if (!isUnassigned) continue; // ejecutor efectivo presente — sin alerta

    // IN_PROGRESS nunca entra en atención: el status de ejecución tiene prioridad absoluta.
    // PENDING sin ejecutor es el único estado que genera alerta operativa.
    if (cleaning.status !== "PENDING") continue;

    if (propertyTeamsCount === 0 && !wgeCoveredPropertyIds.has(cleaning.propertyId)) {
      reason = "NO_ASSIGNED_TEAM";
    } else {
      reason = "NO_ASSIGNED_MEMBER";
    }

    // Si tiene razón para atención, agregar a la lista
    if (reason) {
      cleaningsNeedingAttention.push({
        id: cleaning.id,
        propertyId: cleaning.propertyId,
        scheduledDate: cleaning.scheduledDate,
        status: cleaning.status,
        property: cleaning.property,
        assignedMembershipId: cleaning.assignedMembershipId ?? null,
        assignedMember: cleaning.assignedMember,
        propertyTeamsCount,
        reason,
      });
    }
  }

  // Ordenación dual:
  // 1. Overdue primero: más recientes primero (DESC)
  // 2. Futuras después: más próximas primero (ASC)
  return cleaningsNeedingAttention.sort((a, b) => {
    const isAOverdue = a.scheduledDate < now;
    const isBOverdue = b.scheduledDate < now;

    if (isAOverdue && !isBOverdue) return -1;
    if (!isAOverdue && isBOverdue) return 1;

    if (isAOverdue && isBOverdue) {
      // Overdue: DESC (más reciente arriba)
      return b.scheduledDate.getTime() - a.scheduledDate.getTime();
    }

    // Futuras: ASC (más próximas arriba)
    return a.scheduledDate.getTime() - b.scheduledDate.getTime();
  });
}

/**
 * Obtiene el conteo de limpiezas que requieren atención (para el banner).
 */
export async function getCleaningsNeedingAttentionCount(
  tenantId: string
): Promise<number> {
  const cleanings = await getCleaningsNeedingAttention(tenantId, false);
  return cleanings.length;
}

