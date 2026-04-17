// app/cleaner/team-cleanings/page.tsx
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { resolveCleanerContext } from "@/lib/cleaner/resolveCleanerContext";
import { getCoverThumbUrlsBatch } from "@/lib/media/getCoverThumbUrl";
import Page from "@/lib/ui/Page";
import Link from "next/link";
import { reassignCleaningByLeader } from "@/app/cleaner/cleanings/reassign-actions";
import NoMembershipPage from "../NoMembershipPage";

function formatDateTime(date: Date) {
  return date.toLocaleString("es-MX", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function TeamCleaningsPage({
  searchParams,
}: {
  searchParams?: Promise<{ returnTo?: string }>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const returnTo = params?.returnTo?.startsWith("/cleaner") ? params.returnTo : "/cleaner";

  let context;
  try {
    context = await resolveCleanerContext();
  } catch {
    return <NoMembershipPage />;
  }

  if (!context.hasMembership) {
    return <NoMembershipPage />;
  }

  // Verificar que el usuario tiene role TEAM_LEADER en alguno de sus teams
  const tlMemberships = context.memberships.filter((m) => m.role === "TEAM_LEADER");
  if (tlMemberships.length === 0) {
    redirect(returnTo);
  }

  const tlTeamIds = tlMemberships.map((m) => m.teamId);

  // Cargar limpiezas PENDING del equipo
  const cleanings = await prisma.cleaning.findMany({
    where: {
      teamId: { in: tlTeamIds },
      status: "PENDING",
    },
    select: {
      id: true,
      propertyId: true,
      scheduledDate: true,
      status: true,
      teamId: true,
      assignedMembershipId: true,
      assignmentStatus: true,
      needsAttention: true,
      attentionReason: true,
      property: {
        select: {
          id: true,
          name: true,
          shortName: true,
          coverAssetGroupId: true,
        },
      },
      TeamMembership: {
        select: {
          id: true,
          User: {
            select: { id: true, name: true, email: true },
          },
        },
      },
    },
    orderBy: { scheduledDate: "asc" },
  });

  // Cargar miembros ACTIVE CLEANER de los teams del TL (para selector de reasignación)
  const teamMemberships = await prisma.teamMembership.findMany({
    where: {
      teamId: { in: tlTeamIds },
      status: "ACTIVE",
      role: "CLEANER",
    },
    select: {
      id: true,
      teamId: true,
      User: {
        select: { id: true, name: true, email: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  // Agrupar miembros por team
  const membersByTeam = new Map<string, typeof teamMemberships>();
  for (const m of teamMemberships) {
    const list = membersByTeam.get(m.teamId) ?? [];
    list.push(m);
    membersByTeam.set(m.teamId, list);
  }

  // Obtener thumbnails
  const propertyIds = [...new Set(cleanings.map((c) => c.propertyId))];
  const thumbUrls =
    propertyIds.length > 0
      ? await getCoverThumbUrlsBatch(
          cleanings.map((c) => ({
            id: c.property.id,
            coverAssetGroupId: c.property.coverAssetGroupId || null,
          }))
        )
      : new Map<string, string | null>();

  // Separar en sin ejecutor / asignadas
  const sinEjecutor = cleanings.filter((c) => !c.assignedMembershipId);
  const asignadas = cleanings.filter((c) => !!c.assignedMembershipId);

  function getExecutorName(c: (typeof cleanings)[number]): string {
    if (!c.assignedMembershipId || !c.TeamMembership) return "—";
    return (
      c.TeamMembership.User.name ||
      c.TeamMembership.User.email ||
      "Miembro"
    );
  }

  return (
    <Page
      title="Limpiezas del equipo"
      subtitle="Vista del Team Leader"
      showBack
      backHref={returnTo}
      containerClassName="pt-6"
    >
      <div className="space-y-6">
        {cleanings.length === 0 && (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center">
            <p className="text-base text-neutral-600">
              No hay limpiezas pendientes en tu equipo.
            </p>
          </div>
        )}

        {/* Sin ejecutor */}
        {sinEjecutor.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <span className="inline-flex h-2 w-2 rounded-full bg-amber-400" />
              <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide">
                Sin ejecutor ({sinEjecutor.length})
              </h2>
            </div>

            <div className="space-y-2">
              {sinEjecutor.map((c) => {
                const propertyName = c.property.shortName || c.property.name;
                const thumbUrl = thumbUrls.get(c.property.id) ?? null;
                const members = membersByTeam.get(c.teamId ?? "") ?? [];

                return (
                  <div
                    key={c.id}
                    className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3"
                  >
                    {/* Header row */}
                    <div className="flex items-start gap-3">
                      {thumbUrl ? (
                        <img
                          src={thumbUrl}
                          alt={propertyName}
                          className="h-10 w-10 rounded-lg object-cover shrink-0"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-lg bg-neutral-200 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-neutral-900 truncate">
                          {propertyName}
                        </p>
                        <p className="text-xs text-neutral-500 mt-0.5">
                          {formatDateTime(c.scheduledDate)}
                        </p>
                      </div>
                      <Link
                        href={`/cleaner/cleanings/${c.id}?returnTo=${encodeURIComponent("/cleaner/team-cleanings")}`}
                        className="text-xs text-neutral-500 underline underline-offset-2 shrink-0"
                      >
                        Ver
                      </Link>
                    </div>

                    {/* Formulario de asignación */}
                    {members.length > 0 ? (
                      <form action={reassignCleaningByLeader} className="flex gap-2">
                        <input type="hidden" name="cleaningId" value={c.id} />
                        <input
                          type="hidden"
                          name="returnTo"
                          value="/cleaner/team-cleanings"
                        />
                        <select
                          name="targetMembershipId"
                          required
                          className="flex-1 rounded-lg border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900 bg-white min-w-0"
                        >
                          <option value="">— Asignar a —</option>
                          {members.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.User.name || m.User.email}
                            </option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 shrink-0"
                        >
                          Asignar
                        </button>
                      </form>
                    ) : (
                      <p className="text-xs text-amber-700">
                        Sin miembros activos disponibles para asignar.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Asignadas */}
        {asignadas.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <span className="inline-flex h-2 w-2 rounded-full bg-blue-500" />
              <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide">
                Asignadas ({asignadas.length})
              </h2>
            </div>

            <div className="space-y-2">
              {asignadas.map((c) => {
                const propertyName = c.property.shortName || c.property.name;
                const thumbUrl = thumbUrls.get(c.property.id) ?? null;
                const members = membersByTeam.get(c.teamId ?? "") ?? [];

                return (
                  <div
                    key={c.id}
                    className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-3"
                  >
                    {/* Header row */}
                    <div className="flex items-start gap-3">
                      {thumbUrl ? (
                        <img
                          src={thumbUrl}
                          alt={propertyName}
                          className="h-10 w-10 rounded-lg object-cover shrink-0"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-lg bg-neutral-200 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-neutral-900 truncate">
                          {propertyName}
                        </p>
                        <p className="text-xs text-neutral-500 mt-0.5">
                          {formatDateTime(c.scheduledDate)}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-blue-500" />
                          <span className="text-xs text-neutral-600">
                            {getExecutorName(c)}
                          </span>
                          <span className="text-xs text-blue-600 bg-blue-50 rounded px-1 py-0.5">
                            Asignado
                          </span>
                        </div>
                      </div>
                      <Link
                        href={`/cleaner/cleanings/${c.id}?returnTo=${encodeURIComponent("/cleaner/team-cleanings")}`}
                        className="text-xs text-neutral-500 underline underline-offset-2 shrink-0"
                      >
                        Ver
                      </Link>
                    </div>

                    {/* Reasignar */}
                    {members.length > 0 && (
                      <form action={reassignCleaningByLeader} className="flex gap-2">
                        <input type="hidden" name="cleaningId" value={c.id} />
                        <input
                          type="hidden"
                          name="returnTo"
                          value="/cleaner/team-cleanings"
                        />
                        <select
                          name="targetMembershipId"
                          required
                          className="flex-1 rounded-lg border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900 bg-white min-w-0"
                        >
                          <option value="">— Reasignar a —</option>
                          {members.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.User.name || m.User.email}
                            </option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 shrink-0"
                        >
                          Reasignar
                        </button>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </Page>
  );
}
