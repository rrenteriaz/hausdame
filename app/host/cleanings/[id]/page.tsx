// app/host/cleanings/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { requireHostUser } from "@/lib/auth/requireUser";
import { getCleaningUi, getPropertyColor } from "@/lib/cleaning-ui";
import { createChecklistSnapshotForCleaning } from "@/lib/checklist-snapshot";
import { cleaningDetailInclude, type CleaningDetailPayload } from "@/lib/cleanings/cleaningIncludes";
import CleaningDetailActions from "./CleaningDetailActions";
import ChecklistView from "./ChecklistView";
import CollapsibleChecklist from "./CollapsibleChecklist";
import InventoryCard from "./InventoryCard";
import { getInventoryReviewStatus } from "@/app/host/inventory-review/actions";
import Page from "@/lib/ui/Page";
import PageHeader from "@/lib/ui/PageHeader";
import { getCleaningAttentionReasons } from "@/lib/cleaning-attention-reasons";
import CleaningWarningCard from "./CleaningWarningCard";
import AssignmentSection from "./AssignmentSection";
import HostWebContainer from "@/lib/ui/HostWebContainer";
import { safeReturnTo } from "@/lib/navigation/safeReturnTo";

function formatDateTime(date: Date) {
  return date.toLocaleString("es-MX", {
    weekday: "long",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatStatus(status: string) {
  switch (status) {
    case "PENDING":
      return "Pendiente";
    case "IN_PROGRESS":
      return "En progreso";
    case "COMPLETED":
      return "Completada";
    case "CANCELLED":
      return "Cancelada";
    default:
      return status;
  }
}

function toDateParam(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDuration(startedAt: Date | null, completedAt: Date | null): string | null {
  if (!startedAt) return null;
  
  const end = completedAt || new Date();
  const diffMs = end.getTime() - startedAt.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;

  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

export default async function CleaningDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ returnTo?: string }>;
}) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) notFound();

  // Manejar params y searchParams como Promise
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;

  // Primero obtener la limpieza para obtener el propertyId
  const cleaningWithPropertyId = await (prisma as any).cleaning.findFirst({
    where: { id: resolvedParams.id, tenantId },
    select: { propertyId: true },
  });

  if (!cleaningWithPropertyId) notFound();

  const useWorkGroupReads = process.env.WORKGROUP_READS_ENABLED === "1";

  const [cleaning, propertyTeams, viewsCount, inventoryReview, assignees] = await Promise.all([
    prisma.cleaning.findFirst({
      where: { id: resolvedParams.id, tenantId },
      include: cleaningDetailInclude,
    }),
    // Obtener equipos asignados a la propiedad (flag-aware: WGE cuando WORKGROUP_READS_ENABLED=1)
    (async () => {
      if (useWorkGroupReads) {
        const { getServiceTeamsForPropertyViaWorkGroups } = await import(
          "@/lib/workgroups/resolveWorkGroupsForProperty"
        );
        const teamIds = await getServiceTeamsForPropertyViaWorkGroups(
          tenantId,
          cleaningWithPropertyId.propertyId
        );
        if (teamIds.length === 0) return [];
        const teams = await prisma.team.findMany({
          where: { id: { in: teamIds }, status: "ACTIVE" },
          select: { id: true, name: true },
        });
        return teams.map((t) => ({ teamId: t.id, team: { id: t.id, name: t.name } }));
      }
      return (prisma as any).propertyTeam.findMany({
        where: {
          propertyId: cleaningWithPropertyId.propertyId,
          tenantId,
          team: { status: "ACTIVE" },
        },
        select: {
          teamId: true,
          team: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });
    })(),
    (prisma as any).cleaningView.count({
      where: {
        cleaningId: resolvedParams.id,
        tenantId,
      },
    }).catch(() => 0), // Si falla, retornar 0
    getInventoryReviewStatus(resolvedParams.id), // Obtener estado del inventario
    // Obtener assignees (con manejo de error si la tabla no existe)
    (async () => {
      try {
        return await (prisma as any).cleaningAssignee.findMany({
          where: {
            cleaningId: resolvedParams.id,
            tenantId,
            status: "ASSIGNED",
          },
          include: {
            member: {
              include: {
                team: true,
              },
            },
          },
          orderBy: {
            assignedAt: "asc",
          },
        });
      } catch (error) {
        // Si falla (tabla no existe), retornar array vacío
        console.warn("[CleaningDetailPage] Error obteniendo assignees:", error);
        return [];
      }
    })(),
  ]);

  if (!cleaning) notFound();

  // Tipo tipado del cleaning con includes
  const cleaningTyped = cleaning as CleaningDetailPayload;

  // FASE 4.4.2: Si hay assignedMembershipId pero no hay assignees, construir assignee virtual
  let finalAssignees = assignees || [];
  if (cleaningTyped.assignedMembershipId && finalAssignees.length === 0) {
    // Construir assignee virtual desde TeamMembership
    if (cleaningTyped.TeamMembership) {
      const membership = cleaningTyped.TeamMembership;
      // Obtener leader del team para display name
      const teamLeader = await prisma.teamMembership.findFirst({
        where: {
          teamId: membership.Team.id,
          role: "TEAM_LEADER",
          status: "ACTIVE",
        },
        include: {
          User: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      });
      const { getTeamDisplayNameForHost } = await import("@/lib/host/teamDisplayName");
      const teamDisplayName = getTeamDisplayNameForHost({
        teamName: membership.Team.name,
        leaderUser: teamLeader?.User ?? null,
      });
      finalAssignees = [{
        id: `virtual-${membership.id}`,
        member: {
          id: `m:${membership.id}`, // Prefijo "m:" para membership
          name: membership.User?.name || membership.User?.email || "Miembro",
          team: {
            id: membership.Team.id,
            name: teamDisplayName,
          },
        },
        assignedAt: new Date(), // Usar fecha actual como fallback
      }];
    }
  }

  // FASE 4.4.2: Obtener miembros asignables (TeamMembership + TeamMember legacy)
  // Usar función que siempre consulta ambas fuentes (WorkGroups + PropertyTeam legacy)
  const { resolveAvailableTeamsForProperty } = await import("@/lib/workgroups/resolveAvailableTeamsForProperty");
  const availableTeamsResult = await resolveAvailableTeamsForProperty(
    tenantId,
    cleaningWithPropertyId.propertyId
  );
  const teamIds = availableTeamsResult.teamIds;
  let teamMembers: Array<{ id: string; name: string; team: { id: string; name: string }; assigneeType: "MEMBERSHIP" | "TEAM_MEMBER" }> = [];
  
  if (teamIds.length > 0) {
    // Obtener TeamMembership ACTIVE role CLEANER
    const memberships = await prisma.teamMembership.findMany({
      where: {
        teamId: { in: teamIds },
        status: "ACTIVE",
        role: "CLEANER",
      },
      include: {
        User: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        Team: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [
        { Team: { name: "asc" } },
        { createdAt: "asc" },
      ],
    });

    // Obtener TeamMember legacy
    const teamMembersLegacy = await (prisma as any).teamMember.findMany({
      where: {
        tenantId,
        isActive: true,
        teamId: { in: teamIds },
      },
      include: {
        team: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [
        { team: { name: "asc" } },
        { name: "asc" },
      ],
    });

    // Obtener Team Leaders para display names (Host view)
    const teamLeaders = await prisma.teamMembership.findMany({
      where: {
        teamId: { in: teamIds },
        role: "TEAM_LEADER",
        status: "ACTIVE",
      },
      include: {
        User: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });
    const teamLeaderMap = new Map(
      teamLeaders.map((tl) => [
        tl.teamId,
        { name: tl.User.name, email: tl.User.email },
      ])
    );

    // Importar helper fuera del map para evitar await en función no async
    const { getTeamDisplayNameForHost } = await import("@/lib/host/teamDisplayName");

    // Unificar en formato compatible: value será "m:<membershipId>" o "t:<teamMemberId>"
    teamMembers = [
      ...memberships.map((m) => {
        const leader = teamLeaderMap.get(m.Team.id);
        const teamDisplayName = getTeamDisplayNameForHost({
          teamName: m.Team.name,
          leaderUser: leader,
        });
        return {
          id: `m:${m.id}`, // Prefijo "m:" para membership
          name: m.User.name || m.User.email || "Miembro",
          team: {
            id: m.Team.id,
            name: teamDisplayName,
          },
          assigneeType: "MEMBERSHIP" as const,
        };
      }),
      ...teamMembersLegacy.map((m: any) => {
        const leader = teamLeaderMap.get(m.team.id);
        const teamDisplayName = getTeamDisplayNameForHost({
          teamName: m.team.name,
          leaderUser: leader,
        });
        return {
          id: `t:${m.id}`, // Prefijo "t:" para legacy
          name: m.name,
          team: {
            id: m.team.id,
            name: teamDisplayName,
          },
          assigneeType: "TEAM_MEMBER" as const,
        };
      }),
    ];
  }

  // Conteo para atención debe basarse en cleaning.teamId (ejecución real), no en propertyTeams (config Host).
  const [membershipsCount, legacyCount] = cleaningTyped.teamId
    ? await Promise.all([
        prisma.teamMembership.count({
          where: {
            teamId: cleaningTyped.teamId,
            status: "ACTIVE",
            role: "CLEANER",
          },
        }),
        (prisma as any).teamMember.count({
          where: {
            teamId: cleaningTyped.teamId,
            isActive: true,
          },
        }),
      ])
    : [0, 0];

  // Auto-cargar checklist si la limpieza no lo tiene pero la propiedad sí tiene template
  if (!cleaning.cleaningChecklistItems || cleaning.cleaningChecklistItems.length === 0) {
    const propertyHasChecklist = await (prisma as any).propertyChecklistItem.count({
      where: {
        propertyId: cleaning.propertyId,
        tenantId,
        isActive: true,
      },
    });

    if (propertyHasChecklist > 0) {
      await createChecklistSnapshotForCleaning(tenantId, cleaning.propertyId, cleaning.id);
      
      const freshItems = await (prisma as any).cleaningChecklistItem.findMany({
        where: {
          cleaningId: cleaning.id,
          tenantId,
        },
        orderBy: [
          { area: "asc" },
          { sortOrder: "asc" },
        ],
      });
      cleaning.cleaningChecklistItems = freshItems;
    }
  }

  // Usar helper común para validar returnTo
  const fallbackUrl = `/host/cleanings?view=day&date=${toDateParam(cleaning.scheduledDate)}`;
  const returnTo = safeReturnTo(resolvedSearchParams?.returnTo, fallbackUrl);

  // Usar color por defecto (luego se puede mejorar para usar el color real de la propiedad)
  const color = getPropertyColor(0);
  const ui = getCleaningUi(cleaning.status, color);

  const canAct = cleaning.status === "PENDING" || cleaning.status === "IN_PROGRESS";

  // Calcular nivel de asignación usando helper canónico
  const { getCleaningAssignmentLevel } = await import("@/lib/cleanings/getCleaningAssignmentLevel");
  const { getCleaningAttention } = await import("@/lib/cleanings/getCleaningAttention");
  
  // hasAvailableTeams debe basarse en la UNION de ambas fuentes (WorkGroups + PropertyTeam)
  // Esto asegura que las alertas sean precisas independientemente del flag WORKGROUP_READS_ENABLED
  const hasAvailableTeams = availableTeamsResult.teamIds.length > 0;
  
  const assignmentLevel = getCleaningAssignmentLevel({
    teamId: cleaningTyped.teamId || null,
    assignedMembershipId: cleaningTyped.assignedMembershipId || null,
    assignedMemberId: cleaningTyped.assignedMemberId || null,
    status: cleaning.status,
    startedAt: cleaningTyped.startedAt || null,
    completedAt: cleaningTyped.completedAt || null,
    hasAvailableTeams,
  });

  // Calcular atención requerida basada en el nivel
  const scheduledAtPlanned = cleaningTyped.scheduledAtPlanned || cleaning.scheduledDate;
  const needsAttention = cleaningTyped.needsAttention || false;
  const attentionReason = cleaningTyped.attentionReason || null;
  
  const attentionResult = getCleaningAttention({
    teamId: cleaningTyped.teamId || null,
    assignedMembershipId: cleaningTyped.assignedMembershipId || null,
    assignedMemberId: cleaningTyped.assignedMemberId || null,
    status: cleaning.status,
    startedAt: cleaningTyped.startedAt || null,
    completedAt: cleaningTyped.completedAt || null,
    hasAvailableTeams,
    needsAttention,
    attentionReason,
    teamMembershipsCount: membershipsCount + legacyCount,
  });

  // Obtener leader del team para assignedMember si existe (para compatibilidad con getCleaningAttentionReasons)
  let assignedMemberWithDisplayName = null;
  if (cleaningTyped.assignedMember?.team) {
    const teamLeader = await prisma.teamMembership.findFirst({
      where: {
        teamId: cleaningTyped.assignedMember.team.id,
        role: "TEAM_LEADER",
        status: "ACTIVE",
      },
      include: {
        User: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });
    const { getTeamDisplayNameForHost } = await import("@/lib/host/teamDisplayName");
    const teamDisplayName = getTeamDisplayNameForHost({
      teamName: cleaningTyped.assignedMember.team.name,
      leaderUser: teamLeader?.User ?? null,
    });
    assignedMemberWithDisplayName = {
      id: cleaningTyped.assignedMember.id,
      name: cleaningTyped.assignedMember.name,
      team: {
        id: cleaningTyped.assignedMember.team.id,
        name: teamDisplayName,
      },
    };
  } else if (cleaningTyped.assignedMember) {
    assignedMemberWithDisplayName = {
      id: cleaningTyped.assignedMember.id,
      name: cleaningTyped.assignedMember.name,
      team: null,
    };
  }
  
  // Obtener razones de atención (mantener compatibilidad con CleaningWarningCard existente)
  // Pero filtrar según attentionResult.needsAttention
  // Pasar hasAvailableTeams (UNION de WorkGroups + PropertyTeam) para alertas precisas
  const allAttentionReasons = await getCleaningAttentionReasons(tenantId, {
    id: cleaning.id,
    status: cleaning.status,
    scheduledDate: cleaning.scheduledDate,
    scheduledAtPlanned: scheduledAtPlanned,
    assignedMemberId: cleaningTyped.assignedMemberId || null,
    assignedMembershipId: cleaningTyped.assignedMembershipId || null,
    assignedMember: assignedMemberWithDisplayName,
    propertyId: cleaning.propertyId,
    teamId: cleaningTyped.teamId || null,
    needsAttention,
    attentionReason,
    propertyTeamsCount: propertyTeams.length,
    teamMembershipsCount: membershipsCount + legacyCount,
    hasAvailableTeams, // UNION de WorkGroups + PropertyTeam
  });
  
  // Filtrar razones según el resultado del helper canónico
  // Solo mostrar si attentionResult.needsAttention es true
  const attentionReasons = attentionResult.needsAttention ? allAttentionReasons : [];
  
  return (
    <HostWebContainer>
      <div className="space-y-4">
        <PageHeader
          showBack
          backHref={returnTo}
          title="Detalle de limpieza"
          subtitle={`${cleaningTyped.property.shortName || cleaningTyped.property.name} · ${formatDateTime(cleaning.scheduledDate)} · ${ui.statusText ?? formatStatus(cleaning.status)}`}
          variant="compact"
        />

        <div className="space-y-4">
        {/* Alerta de atención requerida */}
        {attentionReasons.length > 0 && (
          <CleaningWarningCard reasons={attentionReasons} returnTo={returnTo} cleaningId={cleaning.id} />
        )}

        {/* Sección de Asignación */}
        <AssignmentSection
          assignees={finalAssignees}
          teamMembers={teamMembers}
          propertyTeams={propertyTeams}
          hasError={false}
          primaryAssigneeId={
            // FASE 4.4.2: primaryAssigneeId puede ser assignedMembershipId (prefijo "m:") o assignedMemberId (prefijo "t:")
            cleaningTyped.assignedMembershipId 
              ? `m:${cleaningTyped.assignedMembershipId}` 
              : cleaningTyped.assignedMemberId 
              ? `t:${cleaningTyped.assignedMemberId}` 
              : null
          }
          cleaningStatus={cleaning.status}
          assignmentLevel={assignmentLevel}
          teamId={cleaningTyped.teamId || null}
          teamName={cleaningTyped.team?.name || null}
        />

        <section className={`rounded-2xl border border-neutral-200 bg-white p-4 space-y-3`}>
          <div>
            <p className="text-xs text-neutral-500">Propiedad</p>
            <p className={`text-base font-semibold ${ui.titleClass || ""}`}>
              {cleaningTyped.property.name}
            </p>
          </div>

          <div>
            <p className="text-xs text-neutral-500">Fecha y hora</p>
            <p className="text-base text-neutral-900">{formatDateTime(cleaning.scheduledDate)}</p>
          </div>

          <div>
            <p className="text-xs text-neutral-500">Estado</p>
            <p className="text-base text-neutral-900">{ui.statusText ?? formatStatus(cleaning.status)}</p>
          </div>

          {cleaningTyped.startedAt && (
            <div>
              <p className="text-xs text-neutral-500">Iniciada</p>
              <p className="text-base text-neutral-900">
                {formatDateTime(cleaningTyped.startedAt)}
              </p>
            </div>
          )}

          {cleaningTyped.completedAt && (
            <div>
              <p className="text-xs text-neutral-500">Completada</p>
              <p className="text-base text-neutral-900">
                {formatDateTime(cleaningTyped.completedAt)}
              </p>
            </div>
          )}

          {cleaningTyped.startedAt && (
            <div>
              <p className="text-xs text-neutral-500">Duración</p>
              <p className="text-base text-neutral-900">
                {formatDuration(cleaningTyped.startedAt, cleaningTyped.completedAt) || "En progreso..."}
              </p>
            </div>
          )}

          <div>
            <p className="text-xs text-neutral-500">Notas</p>
            <p className="text-base text-neutral-900">
              {cleaning.notes?.trim() ? cleaning.notes : "—"}
            </p>
          </div>


          {cleaningTyped.reservation && (
            <div className="pt-2 border-t border-neutral-100">
              <p className="text-xs text-neutral-500 mb-2">Reserva</p>
              <Link
                href={`/host/reservations/${cleaningTyped.reservation.id}?returnTo=${encodeURIComponent(returnTo)}`}
                className="text-base text-neutral-900 underline underline-offset-2 hover:text-neutral-700"
              >
                Ver reserva
              </Link>
              <p className="text-xs text-neutral-600 mt-1">
                {formatDateTime(cleaningTyped.reservation.startDate)} —{" "}
                {formatDateTime(cleaningTyped.reservation.endDate)}
              </p>
            </div>
          )}

          <div className="pt-2 border-t border-neutral-100">
            <p className="text-xs text-neutral-500">Historial</p>
            <p className="text-base text-neutral-900">— (placeholder)</p>
          </div>
        </section>

        {/* Checklist */}
        {cleaning.cleaningChecklistItems && cleaning.cleaningChecklistItems.length > 0 && (
          <CollapsibleChecklist
            title="Checklist"
            itemsCount={cleaning.cleaningChecklistItems.length}
            completedCount={cleaning.cleaningChecklistItems.filter((item: any) => item.isCompleted).length}
          >
            <ChecklistView
              cleaningId={cleaning.id}
              cleaningStatus={cleaning.status}
              items={cleaning.cleaningChecklistItems.map((item: any) => ({
                id: item.id,
                area: item.area,
                title: item.title,
                sortOrder: item.sortOrder,
                isCompleted: item.isCompleted,
                requiresValue: item.requiresValue || false,
                valueLabel: item.valueLabel,
                valueNumber: item.valueNumber,
                notCompletedReasonCode: item.notCompletedReasonCode,
                notCompletedReasonNote: item.notCompletedReasonNote,
              }))}
            />
          </CollapsibleChecklist>
        )}

        {/* Inventario - Mostrar si existe review o si la limpieza está en progreso o completada */}
        {(inventoryReview || cleaning.status === "IN_PROGRESS" || cleaning.status === "COMPLETED") && (
          <InventoryCard
            cleaningId={cleaning.id}
            review={inventoryReview}
            returnTo={returnTo}
          />
        )}

        {/* Acciones */}
        <section className="p-4">
        <CleaningDetailActions
          cleaning={{
            id: cleaning.id,
            status: cleaning.status,
            scheduledDate: cleaning.scheduledDate,
            property: cleaningTyped.property,
          }}
          returnTo={returnTo}
        />
      </section>
        </div>
      </div>
    </HostWebContainer>
  );
}

