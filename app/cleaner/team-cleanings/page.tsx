// app/cleaner/team-cleanings/page.tsx
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { resolveCleanerContext } from "@/lib/cleaner/resolveCleanerContext";
import { getCoverThumbUrlsBatch } from "@/lib/media/getCoverThumbUrl";
import Page from "@/lib/ui/Page";
import NoMembershipPage from "../NoMembershipPage";
import TeamCleaningsClient, {
  type MemberItem,
  type CleaningItem,
  type CleanerForReassign,
} from "./TeamCleaningsClient";

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

  const tlMemberships = context.memberships.filter((m) => m.role === "TEAM_LEADER");
  if (tlMemberships.length === 0) {
    redirect(returnTo);
  }

  const tlTeamIds = tlMemberships.map((m) => m.teamId);
  const isTeamLeader = true; // ya validamos arriba
  const hasMultipleTeams = tlTeamIds.length > 1;

  // Nombres de equipos — solo necesarios cuando el TL tiene múltiples equipos
  const teamNamesMap = new Map<string, string>();
  if (hasMultipleTeams) {
    const teams = await prisma.team.findMany({
      where: { id: { in: tlTeamIds } },
      select: { id: true, name: true },
    });
    for (const t of teams) {
      teamNamesMap.set(t.id, t.name);
    }
  }

  // Ventana para limpiezas DONE: últimos 90 días
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  // Limpiezas: PENDING + IN_PROGRESS (todas) + DONE (últimos 90 días)
  const cleaningsRaw = await prisma.cleaning.findMany({
    where: {
      teamId: { in: tlTeamIds },
      OR: [
        { status: { in: ["PENDING", "IN_PROGRESS"] } },
        { status: "COMPLETED", scheduledDate: { gte: ninetyDaysAgo } },
      ],
    },
    select: {
      id: true,
      propertyId: true,
      scheduledDate: true,
      status: true,
      teamId: true,
      assignedMembershipId: true,
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
          User: { select: { id: true, name: true, email: true } },
        },
      },
    },
    orderBy: { scheduledDate: "asc" },
  });

  // Todos los miembros activos para el panel izquierdo (TL + CLEANER)
  const allMembershipsRaw = await prisma.teamMembership.findMany({
    where: {
      teamId: { in: tlTeamIds },
      status: "ACTIVE",
    },
    select: {
      id: true,
      teamId: true,
      role: true,
      User: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // Solo CLEANERs para el selector de reasignación
  const cleanerMembershipsRaw = allMembershipsRaw.filter((m) => m.role === "CLEANER");

  // Thumbnails
  const propertyIds = [...new Set(cleaningsRaw.map((c) => c.propertyId))];
  const thumbUrls =
    propertyIds.length > 0
      ? await getCoverThumbUrlsBatch(
          cleaningsRaw.map((c) => ({
            id: c.property.id,
            coverAssetGroupId: c.property.coverAssetGroupId || null,
          }))
        )
      : new Map<string, string | null>();

  // Serializar para el cliente (Date → string)
  const cleanings: CleaningItem[] = cleaningsRaw.map((c) => ({
    id: c.id,
    propertyName: c.property.shortName || c.property.name,
    thumbUrl: thumbUrls.get(c.property.id) ?? null,
    scheduledDate: c.scheduledDate.toISOString(),
    status: c.status as "PENDING" | "IN_PROGRESS" | "COMPLETED",
    assignedMembershipId: c.assignedMembershipId ?? null,
    assignedMemberName: c.TeamMembership
      ? c.TeamMembership.User.name || c.TeamMembership.User.email
      : null,
    teamId: c.teamId ?? "",
    // teamName solo se incluye cuando el TL opera múltiples equipos
    teamName: hasMultipleTeams && c.teamId ? (teamNamesMap.get(c.teamId) ?? undefined) : undefined,
  }));

  // Miembros para panel izquierdo — TL primero, luego CLEANERs
  const members: MemberItem[] = allMembershipsRaw
    .sort((a, b) => {
      if (a.role === "TEAM_LEADER" && b.role !== "TEAM_LEADER") return -1;
      if (a.role !== "TEAM_LEADER" && b.role === "TEAM_LEADER") return 1;
      return 0;
    })
    .map((m) => ({
      membershipId: m.id,
      name: m.User.name || m.User.email,
      role: m.role as "TEAM_LEADER" | "CLEANER",
      teamId: m.teamId,
    }));

  const cleanersForReassign: CleanerForReassign[] = cleanerMembershipsRaw.map((m) => ({
    membershipId: m.id,
    name: m.User.name || m.User.email,
    teamId: m.teamId,
  }));

  return (
    <Page
      title="Limpiezas del equipo"
      subtitle="Vista del Team Leader"
      showBack
      backHref={returnTo}
      containerSpacing="none"
    >
      {cleanings.length === 0 ? (
        <div className="m-4 rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center">
          <p className="text-base text-neutral-600">
            No hay limpiezas registradas en tu equipo.
          </p>
        </div>
      ) : (
        <TeamCleaningsClient
          members={members}
          cleanings={cleanings}
          cleanersForReassign={cleanersForReassign}
          isTeamLeader={isTeamLeader}
        />
      )}
    </Page>
  );
}
