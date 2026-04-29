/**
 * ⚠️ HAUSDAME — CONTRATO VIGENTE (NO ROMPER)
 * Página: /cleaner/teams (LISTADO DE TEAMS — CLEANER)
 *
 * Regla clave: este LISTADO es READ-ONLY.
 * - NO debe incluir CTAs de invitación, activación/inactivación, asignaciones ni pausado.
 * - Solo debe listar los teams a los que el cleaner pertenece (TeamMembership ACTIVE)
 * - Debe navegar al detalle: /cleaner/teams/[teamId]
 *
 * IMPORTANTE: Las acciones operativas (Invitar, Pausar, Asignaciones, etc.) viven SOLO en:
 * docs/contracts/TEAM_TL_CONTRACT.txt y en la página de detalle del team.
 *
 * Si un cambio aquí afecta invitaciones o acciones del detalle, DETENTE y repórtalo.
 */
// app/cleaner/teams/page.tsx
import prisma from "@/lib/prisma";
import { requireCleanerUser } from "@/lib/auth/requireUser";
import Page from "@/lib/ui/Page";
import Link from "next/link";
import { getTeamDisplayName } from "@/lib/cleaner/teamDisplayName";
import CreateCleanerTeamButton from "./CreateCleanerTeamButton";

export default async function CleanerTeamsPage() {
  const user = await requireCleanerUser();

  // BUGFIX: antes se asumía el team por tenant/Team; ahora la fuente es TeamMembership ACTIVE.
  const memberships = await prisma.teamMembership.findMany({
    where: {
      userId: user.id,
      status: "ACTIVE",
    },
    select: {
      teamId: true,
      role: true,
      Team: {
        select: {
          id: true,
          name: true,
          tenantId: true,
          status: true,
          TeamMembership: {
            where: {
              role: "TEAM_LEADER",
              status: "ACTIVE",
            },
            orderBy: { createdAt: "asc" },
            take: 1,
            select: {
              userId: true,
              User: {
                select: {
                  name: true,
                  email: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: [{ createdAt: "asc" }],
  });

  const teamsById = new Map<
    string,
    { team: (typeof memberships)[number]["Team"]; viewerRole: (typeof memberships)[number]["role"] }
  >();
  for (const membership of memberships) {
    if (!teamsById.has(membership.teamId)) {
      teamsById.set(membership.teamId, {
        team: membership.Team,
        viewerRole: membership.role,
      });
    }
  }
  const teams = Array.from(teamsById.values());
  const teamIds = teams.map((t) => t.team.id);

  // Obtener conteos de miembros activos
  const activeMembersCounts = teamIds.length
    ? await prisma.teamMembership.groupBy({
        by: ["teamId"],
        where: {
          teamId: { in: teamIds },
          status: "ACTIVE",
        },
        _count: {
          id: true,
        },
      })
    : [];

  // Obtener conteos de propiedades: priorizar WGE, fallback a PropertyTeam
  const propertyCountsMap = new Map<string, number>();
  
  if (teamIds.length > 0) {
    // Obtener WorkGroupExecutors ACTIVE para identificar qué teams usan WGE
    const executors = await prisma.workGroupExecutor.findMany({
      where: {
        teamId: { in: teamIds },
        status: "ACTIVE",
      },
      select: {
        teamId: true,
        workGroupId: true,
        hostTenantId: true,
      },
    });

    // WGE: fallback to PropertyTeam must be per-team (teams without ACTIVE executors), not global.
    const teamsWithExecutors = new Set(executors.map((e) => e.teamId));
    const teamsNeedingFallback = teamIds.filter((tid) => !teamsWithExecutors.has(tid));

    // Procesar WGE solo para teams que tienen executors
    if (executors.length > 0) {
      // Mapear workGroupId -> Set de teamIds
      const workGroupToTeamIds = new Map<string, Set<string>>();
      const workGroupIdsByTenant = new Map<string, Set<string>>();
      
      for (const executor of executors) {
        if (!workGroupToTeamIds.has(executor.workGroupId)) {
          workGroupToTeamIds.set(executor.workGroupId, new Set());
        }
        workGroupToTeamIds.get(executor.workGroupId)!.add(executor.teamId);
        
        if (!workGroupIdsByTenant.has(executor.hostTenantId)) {
          workGroupIdsByTenant.set(executor.hostTenantId, new Set());
        }
        workGroupIdsByTenant.get(executor.hostTenantId)!.add(executor.workGroupId);
      }

      // WGE: count properties by teamId using workGroupId→propertyId join, deduplicating by teamId.
      // Filter by WorkGroupExecutor.status = "ACTIVE" AND HostWorkGroup.status = "ACTIVE"
      const propertiesByTeamId = new Map<string, Set<string>>();
      
      for (const [hostTenantId, workGroupIds] of workGroupIdsByTenant.entries()) {
        // Primero verificar que los WorkGroups están ACTIVE
        // Filtrar por WorkGroupExecutor.status = "ACTIVE" AND HostWorkGroup.status = "ACTIVE"
        const activeWorkGroups = await (prisma as any).hostWorkGroup.findMany({
          where: {
            id: { in: Array.from(workGroupIds) },
            tenantId: hostTenantId,
            status: "ACTIVE",
          },
          select: {
            id: true,
          },
        });

        const activeWorkGroupIds = new Set(activeWorkGroups.map((wg: any) => wg.id));

        if (activeWorkGroupIds.size === 0) {
          continue;
        }

        const properties = await prisma.hostWorkGroupProperty.findMany({
          where: {
            tenantId: hostTenantId,
            workGroupId: { in: Array.from(activeWorkGroupIds) as unknown as string[] },
            property: {
              isActive: true,
            },
          },
          select: {
            propertyId: true,
            workGroupId: true,
          },
        });

        // Agrupar propiedades únicas por teamId
        for (const prop of properties) {
          const teamIdsForWg = workGroupToTeamIds.get(prop.workGroupId) || new Set();
          for (const teamId of teamIdsForWg) {
            if (!propertiesByTeamId.has(teamId)) {
              propertiesByTeamId.set(teamId, new Set());
            }
            propertiesByTeamId.get(teamId)!.add(prop.propertyId);
          }
        }
      }

      // Contar propiedades únicas por teamId (solo para teams con WGE)
      for (const [teamId, propertyIds] of propertiesByTeamId.entries()) {
        propertyCountsMap.set(teamId, propertyIds.size);
      }
    }

    // Fallback a PropertyTeam por-team para teams sin WorkGroupExecutor ACTIVE
    if (teamsNeedingFallback.length > 0) {
      const propertyTeamCounts = await (prisma as any).propertyTeam.groupBy({
        by: ["teamId"],
        where: {
          teamId: { in: teamsNeedingFallback },
        },
        _count: {
          id: true,
        },
      });

      for (const item of propertyTeamCounts) {
        propertyCountsMap.set(item.teamId, Number(item._count.id));
      }
    }

    // Asegurar que todos los teams tengan conteo (0 si no hay match en ninguna fuente)
    for (const teamId of teamIds) {
      if (!propertyCountsMap.has(teamId)) {
        propertyCountsMap.set(teamId, 0);
      }
    }
  }

  const activeMembersMap = new Map<string, number>(
    activeMembersCounts.map((item) => [item.teamId, Number(item._count.id)])
  );

  return (
    <Page title="Equipos" showBack backHref="/cleaner">
      <div className="p-4 space-y-4">
        {teams.length === 0 ? (
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-center space-y-3">
            <p className="text-neutral-600 text-base">
              Aún no perteneces a ningún equipo
            </p>
            <p className="text-neutral-500 text-sm">
              Crea tu primer equipo o espera a que un líder te invite.
            </p>
            <div className="flex justify-center">
              <CreateCleanerTeamButton />
            </div>
          </div>
        ) : (
          <>
            {teams.map((item) => {
            const propertiesCount = Number(propertyCountsMap.get(item.team.id) ?? 0);
            const membersCount = Number(activeMembersMap.get(item.team.id) ?? 0);
            // Solo el TL activo (membersCount === 1) significa que no hay ejecutores adicionales
            const isTlOnly = membersCount <= 1;
            const isPaused = item.team.status === "PAUSED";
            const badgeLabel = isPaused
              ? "Pausado"
              : propertiesCount === 0
              ? "Sin WG asignado"
              : isTlOnly
              ? "Sin ejecutores"
              : "Activo";
            const badgeClassName = isPaused
              ? "bg-neutral-100 text-neutral-700"
              : propertiesCount === 0
              ? "bg-amber-100 text-amber-800"
              : isTlOnly
              ? "bg-amber-100 text-amber-800"
              : "bg-emerald-100 text-emerald-800";
            const leaderMembership = item.team.TeamMembership[0] ?? null;
            const teamTitle = getTeamDisplayName({
              viewerUserId: user.id,
              viewerMembershipRole: item.viewerRole,
              leaderUser: leaderMembership?.User ?? null,
            });
            return (
              <Link
                key={item.team.id}
                href={`/cleaner/teams/${item.team.id}`}
                className="block rounded-2xl border border-neutral-200 bg-white p-4 hover:border-neutral-300 transition active:scale-[0.99]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-neutral-900 truncate">
                      {teamTitle}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-neutral-500 mt-1">
                      <span>🏠 {propertiesCount} propiedades asignadas</span>
                      <span>👥 {membersCount} miembros activos</span>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${badgeClassName}`}
                  >
                    {badgeLabel}
                  </span>
                </div>
              </Link>
            );
          })}
            <div className="flex justify-center pt-2">
              <CreateCleanerTeamButton />
            </div>
          </>
        )}
      </div>
    </Page>
  );
}

