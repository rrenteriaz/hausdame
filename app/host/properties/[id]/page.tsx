// app/host/properties/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { requireHostUser } from "@/lib/auth/requireUser";
import { Cleaning, Property } from "@/lib/generated/prisma";
import { getExecutorsForWorkGroups } from "@/lib/workgroups/resolveWorkGroupsForProperty";
import CleaningHistory from "./CleaningHistory";
import SyncIcalButton from "./SyncIcalButton";
import ChecklistSummary from "./ChecklistSummary";
import EditPropertyModal from "./EditPropertyModal";
import AdditionalInfo from "./AdditionalInfo";
import CoverImageSection from "./CoverImageSection";
import Page from "@/lib/ui/Page";
import { getCoverThumbUrl } from "@/lib/media/getCoverThumbUrl";
import { PropertyOpeningManager } from "@/components/properties/PropertyOpeningManager";
import WorkGroupsSection from "./WorkGroupsSection";
import HostWebContainer from "@/lib/ui/HostWebContainer";
import { safeReturnTo } from "@/lib/navigation/safeReturnTo";
import { isPastDateOnly } from "@/lib/datetime/isPastDateOnly";
import { getCdmxDate } from "@/lib/datetime/cdmxToday";
import PropertyLocationPreview from "./PropertyLocationPreview";
import { getPropertySetupProgress } from "@/lib/onboarding/property";
import PropertySetupProgressCard from "@/components/onboarding/PropertySetupProgressCard";

function formatDateRange(start: Date, end: Date): string {
  const startStr = start.toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const endStr = end.toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  if (startStr === endStr) {
    return startStr;
  }
  return `${startStr} — ${endStr}`;
}

function formatReservationStatus(status: string): string {
  switch (status) {
    case "CONFIRMED":
      return "Confirmada";
    case "CANCELLED":
      return "Cancelada";
    case "BLOCKED":
      return "Bloqueada";
    default:
      return status;
  }
}

function getReservationStatusBadgeClass(status: string): string {
  switch (status) {
    case "CONFIRMED":
      return "bg-emerald-100 text-emerald-800";
    case "CANCELLED":
      return "bg-red-100 text-red-800";
    case "BLOCKED":
      return "bg-neutral-100 text-neutral-800";
    default:
      return "bg-neutral-100 text-neutral-800";
  }
}

export default async function PropertyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ returnTo?: string; action?: string }>;
}) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) notFound();

  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  // Primero obtener la propiedad para poder usarla en las consultas siguientes
  const property = await (prisma.property.findFirst({
    where: {
      id: resolvedParams.id,
      tenantId,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  }) as Promise<(Property & { 
    user: { id: string; name: string | null; email: string };
  }) | null>);

  if (!property) notFound();

  // Ahora obtener los datos que dependen de property
  const [workGroups, assignedWorkGroups, checklistItems, allProperties, openings] = await Promise.all([
    prisma.hostWorkGroup.findMany({
      where: { 
        tenantId: tenantId,
        status: "ACTIVE", // Solo grupos activos
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
      },
    }),
    prisma.hostWorkGroupProperty.findMany({
      where: {
        propertyId: property.id,
        tenantId: tenantId,
      },
      include: {
        workGroup: {
          select: {
            id: true,
            name: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    (prisma as any).propertyChecklistItem.findMany({
      where: {
        propertyId: property.id, // FASE 4: propertyId ahora apunta directamente a Property.id
        tenantId: tenantId,
      },
      orderBy: [
        { area: "asc" },
        { sortOrder: "asc" },
      ],
    }),
    prisma.property.findMany({
      where: {
        tenantId: tenantId,
        id: { not: resolvedParams.id }, // Excluir la propiedad actual
      },
      select: {
        id: true,
        name: true,
        shortName: true,
      },
      orderBy: { name: "asc" },
    }),
    // Cargar openings para Busco Cleaner (SSR)
    (prisma as any).propertyOpening.findMany({
      where: {
        propertyId: property.id,
        tenantId: tenantId,
      },
      select: {
        id: true,
        status: true,
        zoneLabel: true,
        notes: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    }),
  ]);

  // Obtener URLs de cover si existe
  let coverThumbUrl: string | null = null;
  let coverOriginalUrl: string | null = null;
  
  if (property.coverAssetGroupId) {
    const [thumbAsset, originalAsset] = await Promise.all([
      prisma.asset.findFirst({
        where: {
          groupId: property.coverAssetGroupId,
          variant: "THUMB_256",
        },
        select: { publicUrl: true },
      }),
      prisma.asset.findFirst({
        where: {
          groupId: property.coverAssetGroupId,
          variant: "ORIGINAL",
        },
        select: { publicUrl: true },
      }),
    ]);
    
    coverThumbUrl = thumbAsset?.publicUrl || null;
    coverOriginalUrl = originalAsset?.publicUrl || null;
  }

  // Aplicar tipos correctos para evitar errores de TypeScript
  const typedProperty = property as Property & { 
    user: { id: string; name: string | null; email: string }; // Relación correcta (antes era "owner")
    isActive: boolean;
    groupName: string | null;
    notificationEmail: string | null;
    coverAssetGroupId: string | null;
    latitude: number | null;
    longitude: number | null;
    wifiSsid: string | null;
    wifiPassword: string | null;
    accessCode: string | null;
    icalLastSyncError: string | null;
  };
  
  const assignedWorkGroupIds = new Set(assignedWorkGroups.map((wgp) => wgp.workGroupId));

  // Obtener ejecutores (WorkGroupExecutor) para los WorkGroups asignados (read-only)
  const executors = assignedWorkGroupIds.size > 0
    ? await getExecutorsForWorkGroups(tenantId, Array.from(assignedWorkGroupIds))
    : [];

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
          status: true,
          TeamMembership: {
            where: {
              status: "ACTIVE",
              role: { in: ["TEAM_LEADER", "OWNER"] },
            },
            orderBy: { createdAt: "asc" },
            take: 1,
            select: {
              User: {
                select: {
                  name: true,
                  email: true,
                },
              },
            },
          },
        },
      })
    : [];


  // Crear map con información del leader para cada team
  const executorTeamsMap = new Map(
    executorTeams.map((t) => [
      t.id,
      {
        id: t.id,
        name: t.name,
        status: t.status,
        leaderName: t.TeamMembership[0]?.User?.name || t.TeamMembership[0]?.User?.email?.split("@")[0] || null,
      },
    ])
  );
  
  // Agrupar ejecutores por workGroupId para mostrar en la UI
  const executorsByWorkGroup = new Map<string, typeof executors>();
  for (const executor of executors) {
    if (!executorsByWorkGroup.has(executor.workGroupId)) {
      executorsByWorkGroup.set(executor.workGroupId, []);
    }
    executorsByWorkGroup.get(executor.workGroupId)!.push(executor);
  }

  const activeChecklistItems = (checklistItems as Array<{ isActive: boolean; area: string }>).filter(
    (item) => item.isActive
  );

  const propertySetupProgress = getPropertySetupProgress({
    property: typedProperty,
    assignedWorkGroupsCount: assignedWorkGroups.length,
    activeExecutorsCount: executors.filter((executor) => executor.status === "ACTIVE").length,
    activeChecklistItemsCount: activeChecklistItems.length,
  });

  // Obtener las limpiezas de esta propiedad, ordenadas por fecha más reciente (FASE 4: usar propertyId)
  const cleanings = await (prisma as any).cleaning.findMany({
    where: {
      propertyId: property.id, // FASE 4: propertyId ahora apunta directamente a Property.id
      tenantId: tenantId,
    },
    orderBy: {
      scheduledDate: "desc",
    },
    take: 100, // Limitar a 100 para no sobrecargar
  });

  const typedCleanings = cleanings as Cleaning[];

  // Obtener reservas de esta propiedad
  const now = new Date();
  const allReservations = await (prisma as any).reservation.findMany({
    where: {
      propertyId: property.id,
      tenantId: tenantId,
    },
    include: {
      cleanings: {
        select: {
          id: true,
          status: true,
          needsAttention: true,
        },
      },
    },
    orderBy: { startDate: "asc" },
  });

  // Separar reservas activas hoy y próximas
  // Solo mostrar reservas CONFIRMED (excluir BLOCKED)
  // Semántica date-only: activa si startDate <= hoy CDMX < endDate
  // Se compara UTC midnight (date-only) contra UTC midnight de hoy CDMX,
  // evitando que `now` como timestamp real cruce fronteras de día incorrectamente.
  const { year: cdmxYear, month: cdmxMonth, day: cdmxDay } = getCdmxDate();
  const todayUTCMidnight = new Date(Date.UTC(cdmxYear, cdmxMonth, cdmxDay));
  const activeToday = allReservations.filter((r: any) => {
    if (r.status !== "CONFIRMED") return false;
    const start = new Date(r.startDate);
    const end = new Date(r.endDate);
    return start <= todayUTCMidnight && todayUTCMidnight < end;
  });

  const upcoming = allReservations
    .filter((r: any) => r.status === "CONFIRMED" && !isPastDateOnly(new Date(r.startDate)))
    .slice(0, 10);

  // Manejar returnTo: validar y usar fallback seguro
  // MUST: Fallback siempre a /host/properties (lista), nunca a la misma URL del detalle
  const rawReturnTo = resolvedSearchParams?.returnTo;
  const returnTo = safeReturnTo(rawReturnTo, "/host/properties");

  return (
    <HostWebContainer className="space-y-6">
      <Page
          showBack
          backHref={returnTo}
          title="Detalle de propiedad"
          variant="compact"
        >

      {(propertySetupProgress.isOperational === false || propertySetupProgress.hasWarnings) && (
        <PropertySetupProgressCard
          progress={propertySetupProgress}
          propertyId={typedProperty.id}
          storageKey={`hausdame:onboarding:v1:${user.id}:host:property:${typedProperty.id}:dismissed`}
          returnTo={`/host/properties/${typedProperty.id}?returnTo=${encodeURIComponent(returnTo)}`}
        />
      )}

      {/* Información de la propiedad */}
      <section id="property-info" className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-4 scroll-mt-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-neutral-800">Información de la propiedad</h2>
          <EditPropertyModal property={typedProperty} returnTo={returnTo} />
        </div>

        {/* Layout responsive: WEB (>=lg): imagen+mapa al lado; MÓVIL: imagen+mapa debajo */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Columna izquierda: Información textual */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-base">
              <div className="space-y-1">
                <p className="text-xs font-medium text-neutral-500">Nombre</p>
                <p className="text-neutral-900">{typedProperty.name}</p>
              </div>

              {typedProperty.shortName && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-neutral-500">Alias corto</p>
                  <p className="text-neutral-900">{typedProperty.shortName}</p>
                </div>
              )}

              {/* Imagen de portada en MÓVIL: entre Alias corto y Dirección */}
              <div className="lg:hidden col-span-full">
                <CoverImageSection
                  propertyId={typedProperty.id}
                  coverThumbUrl={coverThumbUrl}
                  coverOriginalUrl={coverOriginalUrl}
                  propertyName={typedProperty.name}
                  returnTo={returnTo}
                />
              </div>

              {typedProperty.address && (
                <div className="space-y-1 md:col-span-2">
                  <p className="text-xs font-medium text-neutral-500">Dirección</p>
                  <p className="text-neutral-900">{typedProperty.address}</p>
                </div>
              )}

              {/* Check-in y Check-out en la misma fila (dentro del bloque superior) */}
              {(typedProperty.checkInTime || typedProperty.checkOutTime) && (
                <div className="space-y-1 md:col-span-2">
                  <div className="grid grid-cols-2 gap-4">
                    {typedProperty.checkInTime && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-neutral-500">Hora de check-in</p>
                        <p className="text-neutral-900">{typedProperty.checkInTime}</p>
                      </div>
                    )}

                    {typedProperty.checkOutTime && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-neutral-500">Hora de check-out</p>
                        <p className="text-neutral-900">{typedProperty.checkOutTime}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Preview de ubicación en MÓVIL (debajo de dirección) */}
            {typedProperty.latitude !== null && typedProperty.longitude !== null && (
              <div className="lg:hidden">
                <PropertyLocationPreview
                  latitude={typedProperty.latitude}
                  longitude={typedProperty.longitude}
                  propertyName={typedProperty.name}
                />
              </div>
            )}
          </div>

          {/* Columna derecha: imagen de portada (solo desktop) */}
          <div className="hidden lg:block">
            <CoverImageSection
              propertyId={typedProperty.id}
              coverThumbUrl={coverThumbUrl}
              coverOriginalUrl={coverOriginalUrl}
              propertyName={typedProperty.name}
              returnTo={returnTo}
            />
          </div>
        </div>

        {/* Mapa full-width debajo del grid (solo desktop; en mobile ya aparece dentro de la col izquierda) */}
        {typedProperty.latitude !== null && typedProperty.longitude !== null && (
          <div className="hidden lg:block">
            <PropertyLocationPreview
              latitude={typedProperty.latitude}
              longitude={typedProperty.longitude}
              propertyName={typedProperty.name}
            />
          </div>
        )}

        {/* Resto de campos (continúan en grid normal) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-base">

          {typedProperty.notes && (
            <div className="space-y-1 md:col-span-2">
              <p className="text-xs font-medium text-neutral-500">Notas</p>
              <p className="text-neutral-900 whitespace-pre-wrap">{typedProperty.notes}</p>
            </div>
          )}

          {typedProperty.timeZone && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-neutral-500">Zona horaria</p>
              <p className="text-neutral-900">{typedProperty.timeZone}</p>
            </div>
          )}


          {typedProperty.groupName && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-neutral-500">Grupo</p>
              <p className="text-neutral-900">{typedProperty.groupName}</p>
            </div>
          )}

          {typedProperty.notificationEmail && (
            <div className="space-y-1 md:col-span-2">
              <p className="text-xs font-medium text-neutral-500">Email de notificaciones</p>
              <p className="text-neutral-900">{typedProperty.notificationEmail}</p>
            </div>
          )}

          {typedProperty.icalUrl && (
            <div className="space-y-1 md:col-span-2">
              <p className="text-xs font-medium text-neutral-500">URL iCal de Airbnb</p>
              <p className="text-neutral-900 break-all text-xs">{typedProperty.icalUrl}</p>
            </div>
          )}

          {/* Acceso y conectividad */}
          {(typedProperty.wifiSsid ||
            typedProperty.wifiPassword ||
            typedProperty.accessCode ||
            (typedProperty.latitude !== null && typedProperty.longitude !== null)) && (
            <div className="md:col-span-2 pt-2 border-t border-neutral-100">
              <p className="text-xs font-semibold text-neutral-700 mb-2">Acceso y conectividad</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {typedProperty.wifiSsid && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-neutral-500">Red Wi‑Fi</p>
                    <p className="text-neutral-900">{typedProperty.wifiSsid}</p>
                  </div>
                )}

                {typedProperty.wifiPassword && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-neutral-500">Contraseña Wi‑Fi</p>
                    <p className="text-neutral-900 break-all">{typedProperty.wifiPassword}</p>
                  </div>
                )}

                {typedProperty.accessCode && (
                  <div className="space-y-1 md:col-span-2">
                    <p className="text-xs font-medium text-neutral-500">Clave de acceso</p>
                    <p className="text-neutral-900 break-all">{typedProperty.accessCode}</p>
                  </div>
                )}

                <div className="space-y-1 md:col-span-2">
                  <p className="text-xs font-medium text-neutral-500">Ubicación</p>
                  {typedProperty.latitude !== null && typedProperty.longitude !== null ? (
                    <div className="space-y-1">
                      <p className="text-neutral-900">Ubicación guardada</p>
                      <p className="text-xs text-neutral-600">
                        Lat: {typedProperty.latitude.toFixed(6)}, Lng: {typedProperty.longitude.toFixed(6)}
                        {" · "}
                        <a
                          className="text-blue-600 hover:text-blue-700 underline underline-offset-2"
                          href={`https://www.google.com/maps?q=${typedProperty.latitude},${typedProperty.longitude}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Abrir en Maps
                        </a>
                      </p>
                    </div>
                  ) : (
                    <p className="text-neutral-600">Aún no has definido una ubicación.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Grupos de trabajo asignados */}
      <div id="property-workgroups" className="scroll-mt-4">
        <WorkGroupsSection
          propertyId={typedProperty.id}
          workGroups={workGroups}
          assignedWorkGroups={assignedWorkGroups}
          executorsByWorkGroup={executorsByWorkGroup}
          executorTeamsMap={executorTeamsMap}
          returnTo={returnTo}
        />
      </div>

      {/* Checklist Summary */}
      <div id="property-checklist" className="mt-6 scroll-mt-4">
        <ChecklistSummary
          propertyId={typedProperty.id}
          itemsByArea={activeChecklistItems
            .reduce((acc, item) => {
              if (!acc[item.area]) acc[item.area] = 0;
              acc[item.area]++;
              return acc;
            }, {} as Record<string, number>)}
        />
      </div>

      {/* Inventario */}
      <Link
        href={`/host/properties/${typedProperty.id}/inventory?returnTo=${encodeURIComponent(returnTo)}`}
        className="block rounded-xl border border-neutral-200 bg-white p-4 mt-6 cursor-pointer hover:border-neutral-300 transition active:scale-[0.99]"
      >
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-semibold text-neutral-800">Inventario</h2>
          <svg
            className="w-4 h-4 text-neutral-400"
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
        </div>
        <p className="text-xs text-neutral-500">
          Gestiona el inventario de items por área de la propiedad.
        </p>
      </Link>

      {/* Reservas */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-4 mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-neutral-800">Reservas</h2>
          <Link
            href={`/host/reservations?propertyId=${typedProperty.id}`}
            className="text-xs text-neutral-600 hover:text-black underline"
          >
            Ver todas
          </Link>
        </div>

        {/* Sincronización iCal */}
        <SyncIcalButton
          propertyId={typedProperty.id}
          hasIcalUrl={!!(typedProperty as any).icalUrl}
          icalLastSyncedAt={(typedProperty as any).icalLastSyncedAt ?? null}
          icalLastSyncError={(typedProperty as any).icalLastSyncError ?? null}
        />

        {/* Activas hoy */}
        {activeToday.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-neutral-700">Activas hoy</h3>
            <ul className="space-y-2">
              {activeToday.map((reservation: any) => {
                const hasCleaning = reservation.cleanings && reservation.cleanings.length > 0;
                const hasAttention = reservation.cleanings?.some((c: any) => c.needsAttention);
                return (
                  <li key={reservation.id}>
                    <Link
                      href={`/host/reservations/${reservation.id}?returnTo=${encodeURIComponent(returnTo)}`}
                      className="block rounded-xl border border-neutral-200 p-3 hover:border-neutral-300 hover:bg-neutral-50 transition"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-neutral-600">
                              {formatDateRange(reservation.startDate, reservation.endDate)}
                            </p>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${getReservationStatusBadgeClass(
                                reservation.status
                              )}`}
                            >
                              {formatReservationStatus(reservation.status)}
                            </span>
                          </div>
                        </div>
                        <span className="text-xs text-neutral-500">Ver reserva →</span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Próximas */}
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-neutral-700">
            Próximas {upcoming.length > 0 && `(${upcoming.length})`}
          </h3>
          {upcoming.length === 0 && activeToday.length === 0 ? (
            <p className="text-xs text-neutral-500 py-2">
              Aún no hay reservas para esta propiedad (iCal).
            </p>
          ) : (
            <ul className="space-y-2">
              {upcoming.map((reservation: any) => {
                const hasCleaning = reservation.cleanings && reservation.cleanings.length > 0;
                const hasAttention = reservation.cleanings?.some((c: any) => c.needsAttention);
                return (
                  <li key={reservation.id}>
                    <Link
                      href={`/host/reservations/${reservation.id}?returnTo=${encodeURIComponent(returnTo)}`}
                      className="block rounded-xl border border-neutral-200 p-3 hover:border-neutral-300 hover:bg-neutral-50 transition"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-neutral-600">
                              {formatDateRange(reservation.startDate, reservation.endDate)}
                            </p>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${getReservationStatusBadgeClass(
                                reservation.status
                              )}`}
                            >
                              {formatReservationStatus(reservation.status)}
                            </span>
                            {hasAttention && (
                              <span className="text-xs text-amber-600 font-medium">⚠️</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {hasCleaning && (
                            <span className="text-xs text-neutral-600">🧹</span>
                          )}
                          <span className="text-xs text-neutral-400">→</span>
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Busco Cleaner */}
      <div className="mt-6">
        <PropertyOpeningManager 
          propertyId={typedProperty.id} 
          returnTo={returnTo}
          initialOpening={openings.find((o: any) => o.status === "ACTIVE" || o.status === "PAUSED") || null}
        />
      </div>

      {/* Historial de limpiezas */}
      <div className="mt-6">
        <CleaningHistory
          cleanings={typedCleanings.map((c) => {
            const cleaning = c as any;
            return {
              id: cleaning.id,
              scheduledDate: cleaning.scheduledDate,
              status: cleaning.status,
              notes: cleaning.notes,
              startedAt: cleaning.startedAt,
              completedAt: cleaning.completedAt,
            };
          })}
          propertyId={typedProperty.id}
          returnTo={returnTo}
        />
      </div>

      {/* Información adicional */}
      <div className="mt-6">
        <AdditionalInfo 
          propertyId={typedProperty.id}
          returnTo={returnTo}
        />
      </div>
    </Page>
    </HostWebContainer>
  );
}
