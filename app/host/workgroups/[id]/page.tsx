// app/host/workgroups/[id]/page.tsx
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { requireHostUser } from "@/lib/auth/requireUser";
import { getCurrentUser } from "@/lib/auth/session";
import Page from "@/lib/ui/Page";
import WorkGroupPropertiesCard from "./WorkGroupPropertiesCard";
import WorkGroupActions from "../WorkGroupActions";
import WorkGroupInvitesSection from "./WorkGroupInvitesSection";
import ExecutorsSection from "./ExecutorsSection";
import ToggleWorkGroupStatusButton from "./ToggleWorkGroupStatusButton";
import { getExecutorsForWorkGroupsForUi } from "@/lib/workgroups/resolveWorkGroupsForProperty";
import { safeReturnTo } from "@/lib/navigation/safeReturnTo";
import { getInviteLink, getInviteRequestBaseUrl } from "@/lib/invites/links";

type ExecutorPerson = {
  name: string | null;
  email: string | null;
  role: string | null;
};

export default async function WorkGroupDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ returnTo?: string }>;
}) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) notFound();

  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestHeaders = await headers();
  const currentUser = await getCurrentUser();

  const workGroup = await prisma.hostWorkGroup.findFirst({
    where: {
      id: resolvedParams.id,
      tenantId: tenantId,
    },
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
    },
  });

  if (!workGroup) notFound();
  const canEditProperties = !!currentUser && ["OWNER", "MANAGER", "AUXILIAR"].includes(currentUser.role);

  // Obtener propiedades asignadas a este grupo de trabajo
  const workGroupProperties = await prisma.hostWorkGroupProperty.findMany({
    where: {
      tenantId: tenantId,
      workGroupId: workGroup.id,
    },
    select: {
      propertyId: true,
    },
  });
  const workGroupPropertyIds = workGroupProperties.map((wgp: { propertyId: string }) => wgp.propertyId);

  // Obtener datos completos de las propiedades asignadas
  const assignedProperties = workGroupPropertyIds.length > 0
    ? await prisma.property.findMany({
        where: {
          id: { in: workGroupPropertyIds },
          tenantId: tenantId,
        },
        select: {
          id: true,
          name: true,
          shortName: true,
          address: true,
          isActive: true,
        },
        orderBy: { name: "asc" },
      })
    : [];

  const allActiveProperties = await prisma.property.findMany({
    where: {
      tenantId: tenantId,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      shortName: true,
      address: true,
      isActive: true,
    },
    orderBy: { name: "asc" },
  });

  // Obtener ejecutores (WorkGroupExecutor) - para UI, sin filtrar por status
  const executors = await getExecutorsForWorkGroupsForUi(tenantId, [workGroup.id]);
  
  // Obtener información de los teams ejecutores (solo lectura)
  const executorTeamIds = executors.map((e) => e.teamId);
  const executorTeams = executorTeamIds.length > 0
    ? await prisma.team.findMany({
        where: {
          id: { in: executorTeamIds },
        },
        select: {
          id: true,
          name: true,
          tenantId: true,
        },
      })
    : [];

  const executorTeamsById: Record<string, { id: string; name: string; tenantId: string }> =
    Object.fromEntries(executorTeams.map((t: { id: string; name: string; tenantId: string }) => [t.id, t]));

  // Obtener información del líder efectivo desde TeamMembership para cada executor
  // Mapear teamId -> nombre del líder efectivo (TEAM_LEADER ACTIVE, o fallback al primer miembro ACTIVE)
  const executorLeaderByTeamId: Record<string, { name: string | null; email: string | null; role: string | null }> = {};
  const executorMembersByTeamId: Record<string, ExecutorPerson[]> = {};
  if (executorTeamIds.length > 0) {
    // Obtener todos los TeamMemberships ACTIVE para estos teams (para calcular líder efectivo)
    const allMemberships = await prisma.teamMembership.findMany({
      where: {
        teamId: { in: executorTeamIds },
        status: "ACTIVE",
      },
      select: {
        teamId: true,
        role: true,
        createdAt: true,
        User: {
          select: {
            name: true,
            email: true,
          },
        },
      },
      orderBy: [{ teamId: "asc" }, { createdAt: "asc" }],
    });

    // Agrupar por teamId y calcular líder efectivo por team
    const membershipsByTeamId = new Map<string, typeof allMemberships>();
    for (const membership of allMemberships) {
      const existing = membershipsByTeamId.get(membership.teamId) || [];
      existing.push(membership);
      membershipsByTeamId.set(membership.teamId, existing);
    }

    // Para cada team, determinar líder efectivo
    for (const [teamId, memberships] of membershipsByTeamId.entries()) {
      executorMembersByTeamId[teamId] = memberships.map((membership) => ({
        name: membership.User.name,
        email: membership.User.email,
        role: membership.role,
      }));

      // Buscar TEAM_LEADER explícito
      const explicitLeader = memberships.find((m: { teamId: string; role: string; createdAt: Date; User: { name: string | null; email: string | null } }) => m.role === "TEAM_LEADER");
      
      // Si no hay TEAM_LEADER, usar el primer miembro ACTIVE (líder efectivo)
      const effectiveLeader = explicitLeader || memberships[0] || null;
      
      // Warning en dev si no hay TEAM_LEADER explícito pero sí hay líder efectivo
      if (process.env.NODE_ENV === "development" && !explicitLeader && effectiveLeader) {
        console.warn(
          "[host/workgroups/[id]] No TEAM_LEADER ACTIVE for executor team; using effective leader fallback",
          {
            teamId,
            effectiveLeaderUserId: effectiveLeader.User?.email || "unknown",
          }
        );
      }
      
      if (effectiveLeader?.User) {
        executorLeaderByTeamId[teamId] = {
          name: effectiveLeader.User.name,
          email: effectiveLeader.User.email,
          role: effectiveLeader.role,
        };
      }
    }
  }

  // Obtener conteos de miembros ACTIVE por teamId
  const executorMembersCountByTeamId: Record<string, number> = {};
  if (executorTeamIds.length > 0) {
    const membersCounts = await prisma.teamMembership.groupBy({
      by: ["teamId"],
      where: {
        teamId: { in: executorTeamIds },
        status: "ACTIVE",
      },
      _count: {
        _all: true,
      },
    });

    for (const count of membersCounts) {
      executorMembersCountByTeamId[count.teamId] = count._count._all;
    }
  }

  // Obtener invitaciones para este WorkGroup
  const invites = await prisma.hostWorkGroupInvite.findMany({
    where: {
      tenantId: tenantId,
      workGroupId: workGroup.id,
    },
    include: {
      createdByUser: {
        select: {
          name: true,
        },
      },
      claimedByUser: {
        select: {
          name: true,
          email: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Inyectar inviteLink generado en servidor
  const inviteBaseUrl = getInviteRequestBaseUrl(requestHeaders);
  const invitesWithLinks = invites.map((invite) => ({
    ...invite,
    inviteLink: getInviteLink(invite.token, "workgroup", inviteBaseUrl),
  }));

  // Validar returnTo y usar fallback seguro
  const returnTo = safeReturnTo(resolvedSearchParams?.returnTo, "/host/workgroups");

  return (
    <Page
      showBack
      backHref={returnTo}
      title="Detalle del grupo de trabajo"
      subtitle={workGroup.name}
      variant="compact"
    >
      <div className="space-y-6">
        <section className="rounded-2xl border border-neutral-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1 flex-1">
              <p className="text-xs text-neutral-500">Grupo de trabajo</p>
              <div className="flex items-center gap-2">
                <p className="text-base font-semibold text-neutral-900">{workGroup.name}</p>
                <span
                  className={`text-xs px-2 py-0.5 rounded ${
                    workGroup.status === "ACTIVE"
                      ? "bg-green-100 text-green-700"
                      : "bg-neutral-100 text-neutral-700"
                  }`}
                >
                  {workGroup.status === "ACTIVE" ? "Activo" : "Inactivo"}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {canEditProperties && (
                <>
                  <ToggleWorkGroupStatusButton
                    workGroupId={workGroup.id}
                    currentStatus={workGroup.status}
                    canEdit={canEditProperties}
                  />
                  <span className="text-neutral-300">·</span>
                </>
              )}
              <WorkGroupActions
                workGroup={workGroup}
                hasProperties={assignedProperties.length > 0}
                hasExecutors={executors.length > 0}
                returnTo={returnTo}
              />
            </div>
          </div>
        </section>

        {/* Propiedades asignadas */}
        <WorkGroupPropertiesCard
          workGroupId={workGroup.id}
          canEdit={canEditProperties}
          assignedProperties={assignedProperties}
          allProperties={allActiveProperties}
          assignedPropertyIds={workGroupPropertyIds}
        />

        {/* Ejecutores */}
        <ExecutorsSection
          workGroupId={workGroup.id}
          executors={executors}
          executorTeamsById={executorTeamsById}
          executorLeaderByTeamId={executorLeaderByTeamId}
          executorMembersByTeamId={executorMembersByTeamId}
          executorMembersCountByTeamId={executorMembersCountByTeamId}
          assignedPropertiesCount={assignedProperties.length}
          canEdit={canEditProperties}
          returnTo={returnTo}
        />

        {/* Invitaciones */}
        {canEditProperties && (
          <WorkGroupInvitesSection
            workGroupId={workGroup.id}
            workGroupName={workGroup.name}
            invites={invitesWithLinks}
            returnTo={returnTo}
          />
        )}

        {/* Info del grupo */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-2">
          <h2 className="text-base font-semibold text-neutral-800">Info del grupo</h2>
          <div>
            <p className="text-xs text-neutral-500">Fecha de creación</p>
            <p className="text-sm text-neutral-900">
              {workGroup.createdAt.toLocaleDateString("es-MX", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </p>
          </div>
        </section>
      </div>
    </Page>
  );
}

