import prisma from "@/lib/prisma";

export type WorkGroupExecutorRef = {
  workGroupId: string;
  servicesTenantId: string;
  teamId: string;
  status: "ACTIVE" | "INACTIVE";
};

export async function getHostWorkGroupsForProperty(
  hostTenantId: string,
  propertyId: string
) {
  const links = await prisma.hostWorkGroupProperty.findMany({
    where: {
      tenantId: hostTenantId,
      propertyId,
    },
    select: {
      workGroupId: true,
    },
  });

  const workGroupIds = Array.from(new Set(links.map((link) => link.workGroupId)));
  if (workGroupIds.length === 0) {
    return [];
  }

  return prisma.hostWorkGroup.findMany({
    where: {
      tenantId: hostTenantId,
      id: { in: workGroupIds },
    },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Obtiene ejecutores para UI (sin filtrar por status, retorna todos con su status)
 * Útil para mostrar ejecutores en la interfaz del Host
 */
export async function getExecutorsForWorkGroupsForUi(
  hostTenantId: string,
  workGroupIds: string[]
): Promise<WorkGroupExecutorRef[]> {
  if (workGroupIds.length === 0) {
    return [];
  }

  const executors = await prisma.workGroupExecutor.findMany({
    where: {
      hostTenantId,
      workGroupId: { in: workGroupIds },
    },
    select: {
      workGroupId: true,
      servicesTenantId: true,
      teamId: true,
      status: true,
    },
    orderBy: [{ workGroupId: "asc" }, { teamId: "asc" }],
  });

  return executors;
}

/**
 * Obtiene ejecutores ACTIVE para los workGroupIds dados.
 *
 * PATH 1 — WorkGroupExecutor ACTIVE (fuente principal).
 * PATH 2 — CLAIMED invites como fallback para WGs sin executor explícito.
 *   Regla: "El TL activo del WG ya es ejecutor".
 *   Si un TL reclamó la invitación al WG, su equipo es elegible aunque no
 *   exista (o se haya inactivado) el registro WorkGroupExecutor.
 *   La elegibilidad se verifica en tiempo real contra TeamMembership ACTIVE.
 */
export async function getActiveExecutorsForWorkGroups(
  hostTenantId: string,
  workGroupIds: string[]
): Promise<WorkGroupExecutorRef[]> {
  if (workGroupIds.length === 0) {
    return [];
  }

  // PATH 1: WorkGroupExecutor ACTIVE
  const executors = await prisma.workGroupExecutor.findMany({
    where: {
      hostTenantId,
      workGroupId: { in: workGroupIds },
      status: "ACTIVE",
    },
    select: {
      workGroupId: true,
      servicesTenantId: true,
      teamId: true,
      status: true,
    },
    orderBy: [{ workGroupId: "asc" }, { teamId: "asc" }],
  });

  // PATH 2: WGs sin ningún executor ACTIVE → resolver desde CLAIMED invites.
  const coveredWGIds = new Set(executors.map((e) => e.workGroupId));
  const uncoveredWGIds = workGroupIds.filter((id) => !coveredWGIds.has(id));

  if (uncoveredWGIds.length > 0) {
    const claimedInvites = await prisma.hostWorkGroupInvite.findMany({
      where: {
        tenantId: hostTenantId,
        workGroupId: { in: uncoveredWGIds },
        status: "CLAIMED",
        claimedByUserId: { not: null },
      },
      select: {
        workGroupId: true,
        claimedByUserId: true,
      },
    });

    if (claimedInvites.length > 0) {
      // Guard: no re-activar teams que el host intencionalmente desactivó (INACTIVE executor).
      const inactiveExecutors = await prisma.workGroupExecutor.findMany({
        where: {
          hostTenantId,
          workGroupId: { in: uncoveredWGIds },
          status: "INACTIVE",
        },
        select: { workGroupId: true, teamId: true },
      });
      const inactiveKeys = new Set(
        inactiveExecutors.map((e) => `${e.workGroupId}:${e.teamId}`)
      );

      const claimerIds = [
        ...new Set(
          claimedInvites
            .map((i) => i.claimedByUserId)
            .filter((id): id is string => id !== null)
        ),
      ];

      // Verificar en tiempo real que el TL sigue activo
      const leaderMemberships = await prisma.teamMembership.findMany({
        where: {
          userId: { in: claimerIds },
          role: "TEAM_LEADER",
          status: "ACTIVE",
        },
        select: {
          userId: true,
          teamId: true,
          Team: { select: { tenantId: true } },
        },
      });

      const userToTeam = new Map(
        leaderMemberships.map((m) => [
          m.userId,
          { teamId: m.teamId, servicesTenantId: m.Team.tenantId },
        ])
      );

      // Deduplicar por (workGroupId, teamId) y excluir intencionalmente inactivos
      const seen = new Set(executors.map((e) => `${e.workGroupId}:${e.teamId}`));

      for (const invite of claimedInvites) {
        if (!invite.claimedByUserId) continue;
        const team = userToTeam.get(invite.claimedByUserId);
        if (!team) continue;
        const key = `${invite.workGroupId}:${team.teamId}`;
        if (seen.has(key) || inactiveKeys.has(key)) continue;
        seen.add(key);
        executors.push({
          workGroupId: invite.workGroupId,
          servicesTenantId: team.servicesTenantId,
          teamId: team.teamId,
          status: "ACTIVE",
        });
      }
    }
  }

  return executors;
}

/**
 * @deprecated Usar getExecutorsForWorkGroupsForUi() o getActiveExecutorsForWorkGroups() según el caso
 * Mantenido para compatibilidad
 */
export async function getExecutorsForWorkGroups(
  hostTenantId: string,
  workGroupIds: string[]
): Promise<WorkGroupExecutorRef[]> {
  // Por defecto, retornar solo ACTIVE para mantener comportamiento existente
  return getActiveExecutorsForWorkGroups(hostTenantId, workGroupIds);
}

export async function getServiceTeamsForPropertyViaWorkGroups(
  hostTenantId: string,
  propertyId: string
) {
  const workGroups = await getHostWorkGroupsForProperty(hostTenantId, propertyId);
  const workGroupIds = workGroups.map((wg) => wg.id);
  // Usar solo ejecutores ACTIVE para acceso a propiedades
  const executors = await getActiveExecutorsForWorkGroups(hostTenantId, workGroupIds);
  const teamIds = Array.from(new Set(executors.map((executor) => executor.teamId)));
  return teamIds.sort();
}

