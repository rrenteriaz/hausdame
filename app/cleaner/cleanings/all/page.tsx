// app/cleaner/cleanings/all/page.tsx
import prisma from "@/lib/prisma";
import { getActiveMembershipsForUser } from "@/lib/cleaner/getActiveMembershipsForUser";
import { getCurrentUser } from "@/lib/auth/session";
import { resolveCleanerContext } from "@/lib/cleaner/resolveCleanerContext";
import { getCleanerCleaningsList, getCleanerScope } from "@/lib/cleaner/cleanings/query";
import { redirect } from "next/navigation";
import Page from "@/lib/ui/Page";
import ListContainer from "@/lib/ui/ListContainer";
import ListRow from "@/lib/ui/ListRow";
import ListThumb from "@/lib/ui/ListThumb";
import { getCoverThumbUrlsBatch } from "@/lib/media/getCoverThumbUrl";
import { formatCleaningStatus } from "@/lib/cleaning-ui";
import AllCleaningsFilters from "./AllCleaningsFilters";
import NoMembershipPage from "../../NoMembershipPage";
import { isPastDateOnly } from "@/lib/datetime/isPastDateOnly";
import { formatDateOnly } from "@/lib/ui/formatDateOnly";

function safeBackHref(input?: string, memberId?: string): string {
  if (input && input.startsWith("/cleaner")) return input;
  return memberId ? `/cleaner?memberId=${encodeURIComponent(memberId)}` : "/cleaner";
}

export default async function AllCleaningsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    memberId?: string;
    month?: string;
    propertyId?: string;
    status?: string;
    scope?: string;
    returnTo?: string;
  }>;
}) {
  // PASO 1: Resolver contexto arriba
  let context;
  let user;
  let hasContextError = false;
  try {
    user = await getCurrentUser();
    if (!user || user.role !== "CLEANER") {
      redirect("/login");
      return;
    }
    context = await resolveCleanerContext();
  } catch (error: any) {
    // No hay membership ni legacy
    hasContextError = true;
  }

  if (hasContextError || !context || !user) {
    return <NoMembershipPage />;
  }

  // LEGACY RETIRADO: Ya no existe modo legacy, siempre usar memberships
  // Si no hay membership, el guard del layout debería haber redirigido
  // Pero por seguridad, verificar explícitamente
  if (!context.hasMembership) {
    return <NoMembershipPage />;
  }
  
  const teamIds = context.memberships.map((m) => m.teamId);

  const primaryTeamId = teamIds[0] ?? null;

  // Si no hay teams, mostrar NoMembershipPage
  if (teamIds.length === 0) {
    return <NoMembershipPage />;
  }

  // LEGACY RETIRADO: Ya no existe modo legacy, siempre usar memberships
  let accessibleTenantIds: string[] = [];
  let allTeamIds: string[] = [];
  let activeTeamIds: string[] = [];
  let membershipIds: string[] = [];
  
  const membershipsAccess = await getActiveMembershipsForUser(user.id);
  const removedMemberships = await prisma.teamMembership.findMany({
    where: { userId: user.id, status: "REMOVED" },
    select: {
      id: true,
      teamId: true,
      Team: { select: { tenantId: true, status: true } },
    },
  });
  const removedMembershipIds = removedMemberships.map((m) => m.id);
  const removedTeamIds = removedMemberships.map((m) => m.teamId);
  const removedTenantIds = removedMemberships
    .map((m) => m.Team?.tenantId)
    .filter((id): id is string => !!id);

  accessibleTenantIds = Array.from(
    new Set([...membershipsAccess.tenantIds, ...removedTenantIds])
  );
  allTeamIds = Array.from(new Set([...membershipsAccess.allTeamIds, ...removedTeamIds]));
  activeTeamIds = membershipsAccess.activeTeamIds;
  membershipIds = Array.from(
    new Set([...membershipsAccess.membershipIds, ...removedMembershipIds])
  );

  if (accessibleTenantIds.length === 0) {
    return <NoMembershipPage />;
  }

  // PASO 2: Header/título con displayName y teamLabel (opcional, para consistencia)
  // Obtener nombres de teams para el título (opcional)
  const teams = primaryTeamId
    ? await (prisma as any).team.findMany({
        where: { id: { in: teamIds } },
        select: { id: true, name: true },
      })
    : [];

  const teamLabel =
    teams.length === 0
      ? ""
      : teams.length === 1
      ? teams[0].name
      : `${teams[0].name} +${teams.length - 1}`;

  // LEGACY RETIRADO: Ya no existe modo legacy
  // Obtener memberId para compatibilidad con código existente
  let currentMemberId: string = "";
  if (primaryTeamId) {
    // Intentar obtener el primer TeamMember del primer team para compatibilidad
    const firstTeamMember = await (prisma as any).teamMember.findFirst({
      where: {
        userId: user.id,
        teamId: primaryTeamId,
        isActive: true,
      },
    });
    if (firstTeamMember) {
      currentMemberId = firstTeamMember.id;
    }
  }

  const params = searchParams ? await searchParams : undefined;
  const memberIdParam = params?.memberId;
  const rawScope = params?.scope;
  const scope: "upcoming" | "all" | "history" =
    rawScope === "upcoming" || rawScope === "all" || rawScope === "history"
      ? rawScope
      : "all";

  // Obtener scope canónico usando query layer
  const cleanerScope = await getCleanerScope(context);

  // Obtener propiedades para el filtro AllCleaningsFilters
  // Necesitamos cargar las propiedades completas para el dropdown
  const availableProperties = cleanerScope.propertyIds.length > 0
    ? await (prisma as any).property.findMany({
        where: {
          id: { in: cleanerScope.propertyIds },
          isActive: { not: false },
        },
        select: {
          id: true,
          name: true,
          shortName: true,
        },
        orderBy: [
          { shortName: "asc" },
          { name: "asc" },
        ],
      })
    : [];

  // Parsear mes (YYYY-MM) o usar mes actual
  const today = new Date();
  let monthDate = new Date(today.getFullYear(), today.getMonth(), 1);

  const monthParam = params?.month;
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [yearStr, monthStr] = monthParam.split("-");
    const year = Number(yearStr);
    const monthNum = Number(monthStr);
    const monthIndex = monthNum - 1;
    if (!Number.isNaN(year) && !Number.isNaN(monthNum) && monthNum >= 1 && monthNum <= 12) {
      monthDate = new Date(year, monthIndex, 1);
    }
  }

  // Calcular rango del mes
  const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  monthStart.setHours(0, 0, 0, 0);
  const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  monthEnd.setHours(23, 59, 59, 999);

  // Próximas = próximos 7 días (desde inicio del día)
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const sevenDaysLater = new Date();
  sevenDaysLater.setDate(now.getDate() + 7);
  sevenDaysLater.setHours(23, 59, 59, 999);

  const dateFrom = scope === "upcoming" ? startOfToday : monthStart;
  const dateTo =
    scope === "upcoming"
      ? sevenDaysLater
      : scope === "history"
      ? new Date(Math.min(monthEnd.getTime(), now.getTime()))
      : monthEnd;

  // availableProperties ya obtenido arriba usando cleanerScope

  // Construir filtros
  const statusFilter = params?.status && ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"].includes(params.status)
    ? [params.status]
    : undefined;

  const propertyIdParam = params?.propertyId;

  // Mapear scope a parámetros del query layer
  let queryScope: "assigned" | "available" | "upcoming" | "history" | "all" = "all";
  if (scope === "upcoming") {
    queryScope = "upcoming";
  } else if (scope === "history") {
    queryScope = "history";
  } else {
    // "all" muestra solo las limpiezas asignadas al cleaner
    queryScope = "assigned";
  }

  // Obtener limpiezas usando query layer canónico
  const { cleanings: allCleanings } = await getCleanerCleaningsList(
    {
      scope: queryScope,
      status: statusFilter,
      propertyId: propertyIdParam,
      scheduledDateFrom: dateFrom,
      scheduledDateTo: dateTo,
      includeCompleted: scope === "all", // Para "Todas" incluir COMPLETED
    },
    context
  );

  // Obtener thumbnails
  const thumbUrls =
    allCleanings.length > 0
      ? await getCoverThumbUrlsBatch(
          allCleanings.map((c: any) => ({
            id: c.property.id,
            coverAssetGroupId: c.property.coverAssetGroupId || null,
          }))
        )
      : new Map<string, string | null>();

  const returnTo = safeBackHref(params?.returnTo, memberIdParam);

  const formatMonthParam = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

  const monthParamForLinks = formatMonthParam(monthDate);

  return (
    <Page
      title={
        scope === "upcoming"
          ? "Próximas limpiezas"
          : scope === "history"
          ? "Historial de limpiezas"
          : "Mis limpiezas"
      }
      subtitle={
        scope === "upcoming"
          ? "Próximos 7 días"
          : scope === "history"
          ? teamLabel
            ? `Completadas del mes · ${teamLabel}`
            : "Completadas del mes"
          : teamLabel
          ? `Mes seleccionado · ${teamLabel}`
          : "Mes seleccionado"
      }
      containerClassName="pt-6"
      showBack={true}
      backHref={returnTo}
    >
      {/* Filtros */}
      <AllCleaningsFilters
        monthParam={monthParamForLinks}
        propertyId={propertyIdParam}
        status={params?.status}
        scope={scope}
        availableProperties={availableProperties}
        memberId={memberIdParam}
      />

      {/* Listado */}
      {allCleanings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center mt-4">
          <p className="text-base text-neutral-600">
            No hay limpiezas para los filtros seleccionados.
          </p>
        </div>
      ) : (
        <div className="mt-4">
          <ListContainer>
            {allCleanings.map((cleaning: any, index: number) => {
              const isLast = index === allCleanings.length - 1;
              const propertyName =
                cleaning.property.shortName || cleaning.property.name;
              const detailsHref = `/cleaner/cleanings/${cleaning.id}?memberId=${encodeURIComponent(
                memberIdParam || currentMemberId
              )}&returnTo=${encodeURIComponent(returnTo)}`;
              const isAssigned = cleaning.assignedMembershipId != null;
              const isOverdue =
                (cleaning.status === "PENDING" || cleaning.status === "IN_PROGRESS") &&
                isPastDateOnly(new Date(cleaning.scheduledDate));

              return (
                <ListRow
                  key={cleaning.id}
                  href={detailsHref}
                  isLast={isLast}
                  ariaLabel={`Ver detalles de limpieza ${propertyName}`}
                >
                  <ListThumb
                    src={thumbUrls.get(cleaning.property.id) || null}
                    alt={propertyName}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-medium text-neutral-900 truncate">
                        {propertyName}
                      </h3>
                      {isOverdue && (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 flex-shrink-0">
                          Vencida
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-500 truncate mt-0.5">
                      {formatDateOnly(new Date(cleaning.scheduledDate))}
                    </p>
                    <p className="text-xs text-neutral-500 mt-1">
                      Estado: {formatCleaningStatus(cleaning.status)}
                      {!isAssigned && (
                        <span className="ml-1 text-amber-600">(Sin asignar)</span>
                      )}
                    </p>
                    {cleaning.notes && (
                      <p className="text-xs text-neutral-500 line-clamp-2 mt-1">
                        {cleaning.notes}
                      </p>
                    )}
                  </div>
                </ListRow>
              );
            })}
          </ListContainer>
        </div>
      )}
    </Page>
  );
}
