// app/cleaner/teams/[teamId]/page.tsx
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { requireCleanerUser } from "@/lib/auth/requireUser";
import Page from "@/lib/ui/Page";
import PropertyAssignmentsSection from "./PropertyAssignmentsSection";
import InviteMemberButton from "../InviteMemberButton";
import TeamStatusActions from "./TeamStatusActions";
import { toggleTeamMemberStatus, setPreferredExecutor, removePreferredExecutor } from "../actions";
import TeamInvitesList, { type TeamInviteItem } from "./TeamInvitesList";
import { getTeamInvites } from "@/lib/teams/getTeamInvites";
import { getTeamDisplayName } from "@/lib/cleaner/teamDisplayName";
import { getCoverThumbUrlsBatch } from "@/lib/media/getCoverThumbUrl";

function formatDate(date: Date) {
  return date.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

async function toggleMemberStatusAction(formData: FormData) {
  "use server";
  await toggleTeamMemberStatus(formData);
}

async function setPreferredExecutorAction(formData: FormData) {
  "use server";
  await setPreferredExecutor(formData);
}

async function removePreferredExecutorAction(formData: FormData) {
  "use server";
  await removePreferredExecutor(formData);
}

export default async function CleanerTeamDetailPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const user = await requireCleanerUser();
  const resolvedParams = await params;

  // BUGFIX: el acceso al detalle debe validar TeamMembership ACTIVE del usuario en este team.
  const membership = await prisma.teamMembership.findFirst({
    where: {
      teamId: resolvedParams.teamId,
      userId: user.id,
      status: "ACTIVE",
    },
    select: { id: true, status: true, role: true },
  });

  if (!membership) {
    notFound();
  }

  const team = await prisma.team.findUnique({
    where: { id: resolvedParams.teamId },
    select: {
      id: true,
      name: true,
      createdAt: true,
      status: true,
    },
  });

  if (!team) {
    notFound();
  }

  // Obtener propiedades vía WorkGroupExecutor (prioridad) o PropertyTeam (fallback)
  const { getPropertiesForCleanerTeamViaWGE } = await import("@/lib/workgroups/getPropertiesForCleanerTeamViaWGE");
  const wgePropertyIds = await getPropertiesForCleanerTeamViaWGE(team.id);

  let properties: any[] = [];
  
  if (wgePropertyIds.length > 0) {
    // WGE: filter Property by hostTenantIds derived from WorkGroupExecutor to avoid cross-tenant mismatch.
    const executors = await prisma.workGroupExecutor.findMany({
      where: {
        teamId: team.id,
        status: "ACTIVE",
      },
      select: {
        hostTenantId: true,
      },
    });
    const hostTenantIds = Array.from(new Set(executors.map((e) => e.hostTenantId)));

    let wgeProperties: any[] = [];
    if (hostTenantIds.length > 0) {
      // Usar propiedades vía WGE con filtro por tenantId
      wgeProperties = await prisma.property.findMany({
        where: {
          id: { in: wgePropertyIds },
          tenantId: { in: hostTenantIds },
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          shortName: true,
          address: true,
          coverAssetGroupId: true,
          notificationEmail: true,
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
        orderBy: [{ shortName: "asc" }, { name: "asc" }],
      });
    } else {
      // Si hay wgePropertyIds pero no hostTenantIds, hacer fallback para evitar pantalla vacía
      if (process.env.NODE_ENV === "development") {
        console.warn(
          "[cleaner/teams/[teamId]] wgePropertyIds present but hostTenantIds empty, falling back to PropertyTeam",
          { teamId: team.id, wgePropertyIdsCount: wgePropertyIds.length }
        );
      }
      wgeProperties = [];
    }

    // Si no hay propiedades vía WGE (por filtro de tenantId o datos inconsistentes), hacer fallback
    if (wgeProperties.length > 0) {
      // Mapear a formato compatible con PropertyTeam
      properties = wgeProperties.map((prop) => ({
        propertyId: prop.id,
        property: prop,
      }));
    } else {
      // Fallback a PropertyTeam cuando WGE no retorna resultados
      properties = await (prisma as any).propertyTeam.findMany({
        where: { teamId: team.id },
        select: {
          propertyId: true,
          property: {
            select: {
              id: true,
              name: true,
              shortName: true,
              address: true,
              coverAssetGroupId: true,
              notificationEmail: true,
              user: {
                select: {
                  name: true,
                  email: true,
                },
              },
            },
          },
        },
        orderBy: [{ property: { shortName: "asc" } }, { property: { name: "asc" } }],
      });
    }
  } else {
    // Fallback a PropertyTeam
    properties = await (prisma as any).propertyTeam.findMany({
      where: { teamId: team.id },
      select: {
        propertyId: true,
        property: {
          select: {
            id: true,
            name: true,
            shortName: true,
            address: true,
            coverAssetGroupId: true,
            notificationEmail: true,
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: [{ property: { shortName: "asc" } }, { property: { name: "asc" } }],
    });
  }

  const [members] = await Promise.all([
    prisma.teamMembership.findMany({
      where: { teamId: team.id },
      select: {
        id: true,
        userId: true,
        role: true,
        status: true,
        createdAt: true,
        User: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // Líder efectivo: TEAM_LEADER ACTIVE, o fallback determinístico
  const activeMembers = members.filter((member) => member.status === "ACTIVE");
  
  const leaderMembershipExplicit =
    members.find((m) => m.role === "TEAM_LEADER" && m.status === "ACTIVE") || null;

  const leaderMembershipEffective =
    leaderMembershipExplicit ||
    (activeMembers.length === 1 ? activeMembers[0] : activeMembers[0] || null);

  const leaderUserId = leaderMembershipEffective?.userId || null;
  
  // Warning en dev si no hay TL explícito ACTIVE (usando fallback)
  if (process.env.NODE_ENV === "development" && !leaderMembershipExplicit && leaderUserId) {
    console.warn(
      "[cleaner/teams/[teamId]] No TEAM_LEADER ACTIVE; using effective leader fallback",
      { teamId: team.id, effectiveLeaderUserId: leaderUserId }
    );
  }
  
  // Warning en dev si el líder efectivo no es TEAM_LEADER (data inconsistente)
  if (
    process.env.NODE_ENV === "development" &&
    leaderMembershipEffective &&
    leaderMembershipEffective.role !== "TEAM_LEADER"
  ) {
    console.warn(
      "[cleaner/teams/[teamId]] Effective leader is not TEAM_LEADER (data inconsistency)",
      {
        teamId: team.id,
        effectiveLeaderUserId: leaderUserId,
        effectiveLeaderRole: leaderMembershipEffective.role,
      }
    );
  }
  
  const isTeamLeader = membership.role === "TEAM_LEADER" && !!leaderUserId && leaderUserId === user.id;
  const teamTitle = getTeamDisplayName({
    viewerUserId: user.id,
    viewerMembershipRole: membership.role,
    leaderUser: leaderMembershipEffective?.User ?? null,
  });
  const visibleMembers = members;
  const membersForUiSource = activeMembers;
  const teamStatus = (team.status ?? "ACTIVE") as "ACTIVE" | "PAUSED" | "INACTIVE";
  const propertyIds = properties.map((p: any) => p.propertyId);
  const pma = (prisma as any).propertyMemberAccess;
  const propertyMemberAccesses =
    propertyIds.length && pma?.findMany
      ? await pma.findMany({
          where: {
            propertyId: { in: propertyIds },
            status: "ACTIVE",
            TeamMembership: {
              teamId: team.id,
            },
          },
          select: {
            propertyId: true,
            teamMembershipId: true,
          },
        })
      : [];

  const assignedMembershipsByProperty = new Map<string, Set<string>>();
  for (const access of propertyMemberAccesses) {
    const set = assignedMembershipsByProperty.get(access.propertyId) ?? new Set<string>();
    set.add(access.teamMembershipId);
    assignedMembershipsByProperty.set(access.propertyId, set);
  }

  const membersForUi = membersForUiSource.map((member) => {
    const name = member.User.name || member.User.email;
    return {
      membershipId: member.id,
      userId: member.userId,
      name,
      email: member.User.email,
      isLeader: leaderUserId === member.userId,
    };
  });

  // Calcular leaderMembershipId para UI (líder efectivo)
  const leaderMembershipIdForUi =
    leaderUserId
      ? membersForUi.find((m) => m.userId === leaderUserId)?.membershipId ?? null
      : null;

  // Thumbnails de portada para la lista de propiedades
  const thumbUrls = properties.length > 0
    ? await getCoverThumbUrlsBatch(
        properties.map((pt: any) => ({
          id: pt.propertyId,
          coverAssetGroupId: pt.property.coverAssetGroupId || null,
        }))
      )
    : new Map<string, string | null>();

  const propertiesForUi = properties.map((pt: any) => {
    const hostLabel =
      pt.property.user?.name ||
      pt.property.notificationEmail ||
      pt.property.user?.email ||
      "—";
    const assignedSet = assignedMembershipsByProperty.get(pt.propertyId) ?? new Set<string>();
    // Si no hay asignaciones explícitas y existe TL, asignar TL por defecto
    const assignedMembershipIds =
      assignedSet.size > 0
        ? Array.from(assignedSet)
        : leaderMembershipIdForUi
        ? [leaderMembershipIdForUi]
        : [];
    const defaultAssignedLeader = assignedSet.size === 0 && !!leaderMembershipIdForUi;
    return {
      id: pt.propertyId,
      name: pt.property.name,
      shortName: pt.property.shortName,
      address: pt.property.address || null,
      thumbUrl: thumbUrls.get(pt.propertyId) || null,
      hostLabel,
      assignedMembershipIds,
      defaultAssignedLeader,
    };
  });

  const invites: TeamInviteItem[] = isTeamLeader
    ? await getTeamInvites({
        teamId: team.id,
        viewer: user,
        take: 20,
      })
    : [];

  // Cargar configuraciones de ejecutor preferido por propiedad (solo para TL)
  const preferredConfigs: Array<{ propertyId: string; preferredMembershipId: string }> =
    isTeamLeader && propertiesForUi.length > 0
      ? await (async () => {
          try {
            return await (prisma as any).propertyAssignmentConfig.findMany({
              where: { teamId: team.id },
              select: { propertyId: true, preferredMembershipId: true },
            });
          } catch {
            return [];
          }
        })()
      : [];

  const preferredByProperty = new Map(
    preferredConfigs.map((c) => [c.propertyId, c.preferredMembershipId])
  );

  return (
    <Page title={teamTitle} showBack backHref="/cleaner/teams" subtitle="Equipo de limpieza">

      <div className="p-4 space-y-4">
        {/* Miembros del equipo */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-neutral-800">Miembros</h2>
            {isTeamLeader && (
              <InviteMemberButton teamId={team.id} teamName={team.name} />
            )}
          </div>
          <div className="space-y-3">
            {visibleMembers.map((member) => {
              const name = member.User.name || member.User.email;
              const initial = name.trim()[0]?.toUpperCase() || "M";
              const isLeader = leaderUserId === member.userId;
              const statusLabel =
                member.status === "ACTIVE"
                  ? "Activo"
                  : member.status === "PENDING"
                  ? "Pendiente"
                  : "Inactivo";
              return (
                <div key={member.id} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-neutral-100 text-neutral-700 flex items-center justify-center text-sm font-semibold">
                    {initial}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-900 truncate">
                      {name}
                    </p>
                      <p className="text-xs text-neutral-500">
                        {isLeader ? "Líder" : "Miembro"} · {statusLabel}
                      </p>
                  </div>
                  </div>
                  {isTeamLeader && !isLeader && (member.status === "ACTIVE" || member.status === "REMOVED") && (
                    <form action={toggleMemberStatusAction}>
                      <input type="hidden" name="teamId" value={team.id} />
                      <input type="hidden" name="membershipId" value={member.id} />
                      <input
                        type="hidden"
                        name="nextStatus"
                        value={member.status === "ACTIVE" ? "REMOVED" : "ACTIVE"}
                      />
                      <button
                        type="submit"
                        className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                          member.status === "ACTIVE"
                            ? "border-neutral-300 text-neutral-700 hover:bg-neutral-50"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        }`}
                      >
                        {member.status === "ACTIVE" ? "Inactivar" : "Activar"}
                      </button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
          {isTeamLeader && (
            <div className="pt-2 border-t border-neutral-100 space-y-2">
              <p className="text-sm font-medium text-neutral-800">Invitaciones</p>
              <TeamInvitesList teamId={team.id} invites={invites} />
            </div>
          )}
        </section>

        <PropertyAssignmentsSection
          teamId={team.id}
          isTeamLeader={isTeamLeader}
          members={membersForUi}
          properties={propertiesForUi}
        />

        {/* Ejecutor preferido por propiedad — solo visible para TL */}
        {isTeamLeader && propertiesForUi.length > 0 && (() => {
          // Todos los miembros activos son ejecutores válidos (incluye al TL).
          // El TL puede ejecutar limpiezas igual que cualquier miembro.
          const executableMembers = membersForUi;
          const hasOtherMembers = executableMembers.length > 1;

          return (
            <section className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-4">
              <div>
                <h2 className="text-base font-semibold text-neutral-800">
                  Ejecutor preferido por propiedad
                </h2>
                <p className="text-xs text-neutral-500 mt-0.5">
                  El miembro seleccionado recibirá automáticamente las nuevas limpiezas de cada propiedad.
                </p>
              </div>

              {!hasOtherMembers ? (
                <p className="text-sm text-neutral-500 bg-neutral-50 rounded-xl px-4 py-3">
                  Actualmente solo tú perteneces a este equipo. Cuando agregues más miembros, podrás elegir un ejecutor preferido por propiedad.
                </p>
              ) : (
                <div className="space-y-4">
                  {propertiesForUi.map((property) => {
                    const currentPreferredId = preferredByProperty.get(property.id) ?? null;
                    const currentMember = currentPreferredId
                      ? executableMembers.find((m) => m.membershipId === currentPreferredId) ?? null
                      : null;

                    return (
                      <div key={property.id} className="space-y-2">
                        <p className="text-sm font-medium text-neutral-900">
                          {property.shortName || property.name}
                        </p>

                        {currentMember ? (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                            <span className="text-sm text-neutral-700">
                              {currentMember.name || currentMember.email}
                              {currentMember.isLeader && (
                                <span className="ml-1 text-xs text-neutral-400">(Tú)</span>
                              )}
                            </span>
                            <span className="text-xs text-blue-600 bg-blue-50 rounded px-1.5 py-0.5">
                              Preferido
                            </span>
                            <form action={removePreferredExecutorAction} className="ml-auto">
                              <input type="hidden" name="teamId" value={team.id} />
                              <input type="hidden" name="propertyId" value={property.id} />
                              <button
                                type="submit"
                                className="text-xs text-neutral-400 hover:text-red-600 underline underline-offset-2 transition"
                              >
                                Quitar
                              </button>
                            </form>
                          </div>
                        ) : (
                          <p className="text-xs text-neutral-400">Sin preferencia — selección automática</p>
                        )}

                        <form action={setPreferredExecutorAction} className="flex gap-2">
                          <input type="hidden" name="teamId" value={team.id} />
                          <input type="hidden" name="propertyId" value={property.id} />
                          <select
                            name="preferredMembershipId"
                            required
                            defaultValue=""
                            className="flex-1 rounded-lg border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900 bg-white min-w-0"
                          >
                            <option value="" disabled>
                              {currentMember ? "— Cambiar a —" : "— Asignar preferido —"}
                            </option>
                            {executableMembers.map((m) => (
                              <option
                                key={m.membershipId}
                                value={m.membershipId}
                              >
                                {m.isLeader
                                  ? `${m.name || m.email} (Tú)`
                                  : (m.name || m.email)}
                              </option>
                            ))}
                          </select>
                          <button
                            type="submit"
                            className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 shrink-0"
                          >
                            {currentMember ? "Cambiar" : "Asignar"}
                          </button>
                        </form>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })()}

        {/* Info del equipo */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-neutral-800">Info del equipo</h2>
            {isTeamLeader && (
              <TeamStatusActions teamId={team.id} status={teamStatus} isTeamLeader={isTeamLeader} />
            )}
          </div>
          <div>
            <p className="text-xs text-neutral-500">Fecha de creación</p>
            <p className="text-sm text-neutral-900">{formatDate(team.createdAt)}</p>
          </div>
          <div>
            <p className="text-xs text-neutral-500">Estado</p>
            <p className="text-sm text-neutral-900">
              {teamStatus === "PAUSED" ? "Pausado" : teamStatus === "INACTIVE" ? "Inactivo" : "Activo"}
            </p>
          </div>
        </section>
      </div>
    </Page>
  );
}

