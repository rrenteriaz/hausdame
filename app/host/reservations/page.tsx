// app/host/reservations/page.tsx
import prisma from "@/lib/prisma";
import { requireHostUser } from "@/lib/auth/requireUser";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReservationFilters from "./ReservationFilters";
import Page from "@/lib/ui/Page";
import ListContainer from "@/lib/ui/ListContainer";
import ListRow from "@/lib/ui/ListRow";
import ListThumb from "@/lib/ui/ListThumb";
import { getCoverThumbUrlsBatch } from "@/lib/media/getCoverThumbUrl";
import CollapsibleSection from "@/lib/ui/CollapsibleSection";

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

function formatStatus(status: string): string {
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

function getStatusBadgeClass(status: string): string {
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

function getCleaningStatusText(cleanings: Array<{ status: string; needsAttention: boolean }>): {
  text: string;
  hasAttention: boolean;
} {
  if (cleanings.length === 0) {
    return { text: "", hasAttention: false };
  }

  const hasAttention = cleanings.some((c) => c.needsAttention);
  const pending = cleanings.filter((c) => c.status === "PENDING" || c.status === "IN_PROGRESS");
  const completed = cleanings.filter((c) => c.status === "COMPLETED");
  const cancelled = cleanings.filter((c) => c.status === "CANCELLED");

  if (pending.length > 0) {
    return { text: "Limpieza pendiente", hasAttention };
  }
  if (completed.length === cleanings.length) {
    return { text: "Limpieza completada", hasAttention };
  }
  if (cancelled.length > 0) {
    return { text: "Limpieza cancelada", hasAttention };
  }
  return { text: "", hasAttention };
}

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ propertyId?: string; status?: string; dateBucket?: string; year?: string }>;
}) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) notFound();

  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  // Obtener propiedades para el filtro
  const properties = await prisma.property.findMany({
    where: { tenantId: tenantId },
    select: { id: true, name: true, shortName: true },
    orderBy: { name: "asc" },
  });

  // Calcular startOfToday para el filtro de fecha
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Años disponibles (para chips)
  const allDates = await prisma.reservation.findMany({
    where: { tenantId },
    select: { startDate: true },
  });
  const availableYears = [...new Set(allDates.map((r) => r.startDate.getFullYear()))].sort() as number[];

  const selectedYear = resolvedSearchParams?.year ? parseInt(resolvedSearchParams.year) : null;

  // Construir filtros
  const where: any = { tenantId };

  if (resolvedSearchParams?.propertyId) {
    where.propertyId = resolvedSearchParams.propertyId;
  }

  // Status: por defecto CONFIRMED
  const statusFilter = resolvedSearchParams?.status;
  if (statusFilter === "all") {
    // no filter
  } else if (statusFilter) {
    where.status = statusFilter;
  } else {
    where.status = "CONFIRMED";
  }

  // Año seleccionado
  if (selectedYear) {
    where.startDate = {
      gte: new Date(selectedYear, 0, 1),
      lt: new Date(selectedYear + 1, 0, 1),
    };
  }

  // Período: por defecto Próximas (CURRENT_FUTURE)
  const dateBucket = resolvedSearchParams?.dateBucket || "CURRENT_FUTURE";
  if (dateBucket === "PAST") {
    where.endDate = { lt: today };
  } else if (dateBucket === "CURRENT_FUTURE") {
    where.endDate = { gte: today };
  }
  // "ALL" — sin filtro de fecha

  // Obtener reservas con property y cleanings
  const reservations = await prisma.reservation.findMany({
    where,
    include: {
      property: {
        select: {
          id: true,
          name: true,
          shortName: true,
          coverAssetGroupId: true,
        },
      },
      cleanings: {
        select: {
          id: true,
          status: true,
          needsAttention: true,
        },
      },
    },
    orderBy: { startDate: "asc" }, // De más próximas a más futuras
    take: 100, // Mostrar últimas 100
  });

  // Obtener thumbnails en batch para propiedades de las reservas
  const propertyIds = reservations.map((r) => r.property.id);
  const thumbUrls = await getCoverThumbUrlsBatch(
    reservations.map((r) => ({ 
      id: r.property.id, 
      coverAssetGroupId: (r.property as any).coverAssetGroupId || null 
    }))
  );

  // Agrupar reservas por mes
  const reservationsByMonth = new Map<string, typeof reservations>();
  reservations.forEach((reservation) => {
    const monthKey = reservation.startDate.toLocaleDateString("es-MX", {
      year: "numeric",
      month: "long",
    });
    if (!reservationsByMonth.has(monthKey)) {
      reservationsByMonth.set(monthKey, []);
    }
    reservationsByMonth.get(monthKey)!.push(reservation);
  });

  // Convertir a array y ordenar por fecha del mes (más próximo primero)
  const monthGroups = Array.from(reservationsByMonth.entries())
    .map(([monthKey, monthReservations]) => {
      const firstReservation = monthReservations[0];
      const monthDate = new Date(
        firstReservation.startDate.getFullYear(),
        firstReservation.startDate.getMonth(),
        1
      );
      return { monthKey, monthReservations, monthDate };
    })
    .sort((a, b) => a.monthDate.getTime() - b.monthDate.getTime());

  // Mes actual para abrir por defecto
  const currentMonthKey = today.toLocaleDateString("es-MX", { year: "numeric", month: "long" });
  const hasCurrentMonth = monthGroups.some((g) => g.monthKey === currentMonthKey);

  // Función para formatear el mes en español con capitalización
  const formatMonthTitle = (monthKey: string): string => {
    return monthKey.charAt(0).toUpperCase() + monthKey.slice(1);
  };

  return (
    <Page title="Reservas" subtitle="Sincronizadas desde iCal (solo lectura)">
      <div className="space-y-6">

      {/* Filtros */}
      <div className="space-y-3">
        <ReservationFilters
          properties={properties}
          currentPropertyId={resolvedSearchParams?.propertyId}
          currentStatus={resolvedSearchParams?.status || "CONFIRMED"}
          currentDateBucket={
            resolvedSearchParams?.dateBucket === "PAST" ||
            resolvedSearchParams?.dateBucket === "CURRENT_FUTURE" ||
            resolvedSearchParams?.dateBucket === "ALL"
              ? (resolvedSearchParams.dateBucket as "PAST" | "CURRENT_FUTURE" | "ALL")
              : "CURRENT_FUTURE"
          }
          availableYears={availableYears}
          currentYear={selectedYear}
        />
      </div>

      {/* Lista de reservas agrupadas por mes */}
      <section>
        {reservations.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center">
            <p className="text-base text-neutral-600">
              No se encontraron reservas con los filtros seleccionados.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {monthGroups.map(({ monthKey, monthReservations }, groupIndex) => {
              const isCurrentMonth = monthKey === currentMonthKey;
              const shouldOpen = isCurrentMonth || (!hasCurrentMonth && groupIndex === 0);
              return (
                <CollapsibleSection
                  key={monthKey}
                  title={formatMonthTitle(monthKey)}
                  count={monthReservations.length}
                  defaultOpen={shouldOpen}
                >
                  <ListContainer>
                    {monthReservations.map((reservation, index) => {
                      const cleaningStatus = getCleaningStatusText(reservation.cleanings);
                      const propertyName = reservation.property.shortName || reservation.property.name;
                      const isLast = index === monthReservations.length - 1;

                      return (
                        <ListRow
                          key={reservation.id}
                          href={`/host/reservations/${reservation.id}?returnTo=/host/reservations`}
                          isLast={isLast}
                          ariaLabel={`Ver detalles de reserva ${propertyName}`}
                        >
                          <ListThumb src={thumbUrls.get(reservation.property.id) || null} alt={propertyName} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <h3 className="text-base font-medium text-neutral-900 truncate">
                                {propertyName}
                              </h3>
                            </div>
                            <p className="text-xs text-neutral-500 truncate mt-0.5">
                              {formatDateRange(reservation.startDate, reservation.endDate)}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 mt-1.5">
                              <span
                                className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClass(
                                  reservation.status
                                )}`}
                              >
                                {formatStatus(reservation.status)}
                              </span>
                              {cleaningStatus.text && (
                                <span className="text-xs text-neutral-600">
                                  🧹 {cleaningStatus.text}
                                </span>
                              )}
                              {cleaningStatus.hasAttention && (
                                <span className="text-xs text-amber-600 font-medium">
                                  ⚠️ Atención requerida
                                </span>
                              )}
                            </div>
                          </div>
                        </ListRow>
                      );
                    })}
                  </ListContainer>
                </CollapsibleSection>
              );
            })}
          </div>
        )}
      </section>
    </div>
    </Page>
  );
}

