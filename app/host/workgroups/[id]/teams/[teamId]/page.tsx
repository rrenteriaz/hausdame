// app/host/workgroups/[id]/teams/[teamId]/page.tsx
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { requireHostUser } from "@/lib/auth/requireUser";
import { getCurrentUser } from "@/lib/auth/session";
import Page from "@/lib/ui/Page";
import { getTeamDisplayNameForHost } from "@/lib/host/teamDisplayName";
import { getCoverThumbUrlsBatch } from "@/lib/media/getCoverThumbUrl";
import { formatCleaningStatus } from "@/lib/cleaning-ui";
import Link from "next/link";
import ToggleExecutorStatusButton from "./ToggleExecutorStatusButton";
import ListContainer from "@/lib/ui/ListContainer";
import ListRow from "@/lib/ui/ListRow";
import ListThumb from "@/lib/ui/ListThumb";
import { formatDateOnly } from "@/lib/ui/formatDateOnly";

export default async function TeamDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; teamId: string }>;
  searchParams?: Promise<{ returnTo?: string }>;
}) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) notFound();

  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const currentUser = await getCurrentUser();

  const workGroupId = resolvedParams.id;
  const teamId = resolvedParams.teamId;

  // Verificar que el WorkGroup existe y pertenece al tenant
  const workGroup = await prisma.hostWorkGroup.findFirst({
    where: {
      id: workGroupId,
      tenantId: tenantId,
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (!workGroup) notFound();

  // Verificar que el executor existe
  const executor = await prisma.workGroupExecutor.findFirst({
    where: {
      hostTenantId: tenantId,
      workGroupId,
      teamId,
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (!executor) notFound();

  // Obtener información del team
  const team = await prisma.team.findFirst({
    where: {
      id: teamId,
    },
    select: {
      id: true,
      name: true,
      tenantId: true,
    },
  });

  if (!team) notFound();

  // Obtener líder efectivo del team (incluir id para membershipIds)
  const allMemberships = await prisma.teamMembership.findMany({
    where: {
      teamId,
      status: "ACTIVE",
    },
    select: {
      id: true,
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
    orderBy: [{ role: "desc" }, { createdAt: "asc" }],
  });

  const explicitLeader = allMemberships.find((m) => m.role === "TEAM_LEADER");
  const effectiveLeader = explicitLeader || allMemberships[0] || null;
  const leaderUser = effectiveLeader?.User || null;

  const displayName = getTeamDisplayNameForHost({
    teamName: team.name,
    leaderUser,
  });

  // Obtener propiedades asignadas al WorkGroup
  const workGroupProperties = await prisma.hostWorkGroupProperty.findMany({
    where: {
      tenantId: tenantId,
      workGroupId,
    },
    select: {
      propertyId: true,
    },
  });

  const propertyIds = workGroupProperties.map((p) => p.propertyId);

  if (propertyIds.length === 0) {
    // No hay propiedades asignadas, mostrar página vacía
    // Siempre regresar a la página de detalle del grupo de trabajo
    const returnTo = `/host/workgroups/${workGroupId}`;
    const canEdit = !!currentUser && ["OWNER", "MANAGER", "AUXILIAR"].includes(currentUser.role);

    return (
      <Page
        showBack
        backHref={returnTo}
        title="Detalle del equipo"
        subtitle={displayName}
        variant="compact"
      >
        <div className="space-y-6">
          <section className="rounded-2xl border border-neutral-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1 flex-1">
                <p className="text-xs text-neutral-500">Equipo ejecutor</p>
                <p className="text-base font-semibold text-neutral-900">{displayName}</p>
                <span
                  className={`text-xs px-2 py-0.5 rounded ${
                    executor.status === "ACTIVE"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-neutral-100 text-neutral-700"
                  }`}
                >
                  {executor.status === "ACTIVE" ? "Activo" : "Inactivo"}
                </span>
              </div>
            </div>
          </section>

          {canEdit && (
            <ToggleExecutorStatusButton
              workGroupId={workGroupId}
              teamId={teamId}
              currentStatus={executor.status}
              returnTo={returnTo}
            />
          )}

          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center">
            <p className="text-base text-neutral-600">
              Este grupo de trabajo no tiene propiedades asignadas aún.
            </p>
          </div>
        </div>
      </Page>
    );
  }

  // Reusar allMemberships para obtener membershipIds (optimización: evitar query duplicada)
  const membershipIds = allMemberships.map((m) => m.id);

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  // Limpiezas pasadas: scheduledDate < hoy O status COMPLETED/CANCELLED
  const pastCleanings = await (prisma as any).cleaning.findMany({
    where: {
      tenantId: tenantId,
      propertyId: { in: propertyIds },
      AND: [
        {
          OR: [
            { scheduledDate: { lt: startOfToday } },
            { status: "COMPLETED" },
            { status: "CANCELLED" },
          ],
        },
        {
          OR: [
            ...(membershipIds.length > 0
              ? [{ assignedMembershipId: { in: membershipIds } }]
              : []),
            { teamId },
          ],
        },
      ],
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
    orderBy: { scheduledDate: "desc" },
    take: 100,
  });

  // Limpiezas futuras: scheduledDate >= hoy Y status no COMPLETED
  const futureCleanings = await (prisma as any).cleaning.findMany({
    where: {
      tenantId: tenantId,
      propertyId: { in: propertyIds },
      scheduledDate: { gte: startOfToday },
      status: { not: "COMPLETED" },
      OR: [
        ...(membershipIds.length > 0
          ? [{ assignedMembershipId: { in: membershipIds } }]
          : []),
        { teamId },
      ],
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
    orderBy: { scheduledDate: "asc" },
    take: 100,
  });

  // Obtener thumbnails
  const allPropertyIds = [
    ...new Set([
      ...pastCleanings.map((c: any) => c.property.id),
      ...futureCleanings.map((c: any) => c.property.id),
    ]),
  ];

  const thumbUrls = await getCoverThumbUrlsBatch(
    allPropertyIds.map((id) => {
      const cleaning = [...pastCleanings, ...futureCleanings].find(
        (c: any) => c.property.id === id
      );
      return {
        id,
        coverAssetGroupId: cleaning?.property?.coverAssetGroupId || null,
      };
    })
  );

  // Siempre regresar a la página de detalle del grupo de trabajo
  const returnTo = `/host/workgroups/${workGroupId}`;
  const canEdit = !!currentUser && ["OWNER", "MANAGER", "AUXILIAR"].includes(currentUser.role);

  return (
    <Page
      showBack
      backHref={returnTo}
      title="Detalle del equipo"
      subtitle={displayName}
      variant="compact"
    >
      <div className="space-y-6">
        {/* Información del equipo */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1 flex-1">
              <p className="text-xs text-neutral-500">Equipo ejecutor</p>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-base font-semibold text-neutral-900">{displayName}</p>
                <span
                  className={`text-xs px-2 py-0.5 rounded ${
                    executor.status === "ACTIVE"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-neutral-100 text-neutral-700"
                  }`}
                >
                  {executor.status === "ACTIVE" ? "Activo" : "Inactivo"}
                </span>
              </div>
            </div>
            {/* Acción de desactivar/activar */}
            {canEdit && (
              <ToggleExecutorStatusButton
                workGroupId={workGroupId}
                teamId={teamId}
                currentStatus={executor.status}
                returnTo={returnTo}
              />
            )}
          </div>
        </section>

        {/* Limpiezas futuras */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-4">
          <h2 className="text-base font-semibold text-neutral-800">
            Limpiezas futuras ({futureCleanings.length})
          </h2>
          {futureCleanings.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-300 p-4 text-center">
              <p className="text-xs text-neutral-500">
                No hay limpiezas futuras asignadas a este equipo.
              </p>
            </div>
          ) : (
            <ListContainer>
              {futureCleanings.map((cleaning: any, index: number) => {
                const thumbUrl = thumbUrls.get(cleaning.property.id) || null;
                const statusText = formatCleaningStatus(cleaning.status);
                const scheduledDate = new Date(cleaning.scheduledDate);
                const dateStr = formatDateOnly(scheduledDate);

                return (
                  <ListRow
                    key={cleaning.id}
                    href={`/host/cleanings/${cleaning.id}?returnTo=${encodeURIComponent(
                      `/host/workgroups/${workGroupId}/teams/${teamId}?returnTo=${encodeURIComponent(returnTo)}`
                    )}`}
                    isLast={index === futureCleanings.length - 1}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <ListThumb
                        src={thumbUrl}
                        alt={cleaning.property.name || ""}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-neutral-900 truncate">
                          {cleaning.property.shortName || cleaning.property.name}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-xs text-neutral-500">{dateStr}</p>
                          <span className="text-xs text-neutral-400">·</span>
                          <p className="text-xs text-neutral-500">{statusText}</p>
                        </div>
                      </div>
                    </div>
                  </ListRow>
                );
              })}
            </ListContainer>
          )}
        </section>

        {/* Historial de limpiezas */}
        <Link
          href={`/host/workgroups/${workGroupId}/teams/${teamId}/history?returnTo=${encodeURIComponent(`/host/workgroups/${workGroupId}/teams/${teamId}`)}`}
          className="flex items-center justify-between group"
        >
          <h2 className="text-base font-semibold text-neutral-800 group-hover:text-neutral-900 transition-colors">
            Historial de limpiezas
          </h2>
          <svg
            className="w-5 h-5 text-neutral-400 group-hover:text-neutral-600 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </Link>
      </div>
    </Page>
  );
}

