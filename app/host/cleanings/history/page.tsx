// app/host/cleanings/history/page.tsx
import prisma from "@/lib/prisma";
import { requireHostUser } from "@/lib/auth/requireUser";
import Link from "next/link";
import FilterButtons from "./FilterButtons";
import Page from "@/lib/ui/Page";
import ListContainer from "@/lib/ui/ListContainer";
import ListRow from "@/lib/ui/ListRow";
import ListThumb from "@/lib/ui/ListThumb";
import { getCoverThumbUrlsBatch } from "@/lib/media/getCoverThumbUrl";
import StopPropagationLink from "@/lib/ui/StopPropagationLink";
import CollapsibleSection from "@/lib/ui/CollapsibleSection";
import { formatDateOnly } from "@/lib/ui/formatDateOnly";
import { getCdmxDate } from "@/lib/datetime/cdmxToday";

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

function formatDateTime(date: Date) {
  return formatDateOnly(date);
}

function getPeriodDates(period: string): { start: Date; end: Date } {
  // Usar getCdmxDate() + Date.UTC() para que los límites sean UTC midnight del día
  // CDMX correcto y no dependan del TZ del servidor.
  // scheduledDate es @db.Date → Prisma compara solo la parte DATE (trunca la hora).
  const { year, month, day } = getCdmxDate();
  const today = new Date(Date.UTC(year, month, day));

  switch (period) {
    case "this-month":
      return { start: new Date(Date.UTC(year, month, 1)), end: today };
    case "previous-month":
      return {
        start: new Date(Date.UTC(year, month - 1, 1)),
        // Date.UTC con day=0 da el último día del mes anterior
        end: new Date(Date.UTC(year, month, 0)),
      };
    case "this-year":
      return { start: new Date(Date.UTC(year, 0, 1)), end: today };
    case "last-year":
      return {
        start: new Date(Date.UTC(year - 1, 0, 1)),
        end: new Date(Date.UTC(year - 1, 11, 31)),
      };
    case "last-365-days":
      return { start: new Date(Date.UTC(year, month, day - 365)), end: today };
    default:
      return { start: new Date(Date.UTC(year, month, 1)), end: today };
  }
}

export default async function CleaningHistoryPage({
  searchParams,
}: {
  searchParams?: Promise<{ propertyId?: string; period?: string; status?: string }>;
}) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  const params = searchParams ? await searchParams : undefined;
  const selectedPropertyId = params?.propertyId || "";
  const selectedPeriod = params?.period || "this-month";
  // Si hay status en params, usarlo; si no, usar "COMPLETED" como default solo en primera carga
  // Si el valor es "ALL", significa que el usuario seleccionó explícitamente "Todos los estados"
  const selectedStatus = params?.status || "COMPLETED";

  // Obtener propiedades
  const properties = await prisma.property.findMany({
    where: {
      tenantId,
      ...({ isActive: true } as any),
    },
    select: {
      id: true,
      name: true,
      shortName: true,
    },
    orderBy: { name: "asc" },
  });

  // Obtener fechas del período seleccionado
  const { start, end } = getPeriodDates(selectedPeriod);

  // Construir query para limpiezas
  const whereClause: any = {
    tenantId,
    scheduledDate: {
      gte: start,
      lte: end,
    },
  };

  if (selectedPropertyId) {
    whereClause.propertyId = selectedPropertyId;
  }

  // Filtrar por estado
  if (selectedStatus && selectedStatus !== "ALL" && ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"].includes(selectedStatus)) {
    // Si hay un estado específico, aplicar el filtro
    whereClause.status = selectedStatus;
  } else if (selectedStatus === "ALL") {
    // Si es "Todos", no aplicar ningún filtro de estado (mostrar todos los estados)
    // No agregamos nada al whereClause para estado
  } else {
    // Por defecto (primera carga sin filtro explícito), mostrar solo completadas y canceladas o pasadas
    whereClause.OR = [
      { scheduledDate: { lt: new Date() } },
      { status: "COMPLETED" },
      { status: "CANCELLED" },
    ];
  }

  // Obtener limpiezas pasadas filtradas
  const pastCleanings = await (prisma as any).cleaning.findMany({
    where: whereClause,
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
          team: true,
        },
      },
    },
    orderBy: { scheduledDate: "desc" },
    take: 500,
  });

  // Obtener thumbnails en batch para propiedades de las limpiezas pasadas
  const thumbUrls = await getCoverThumbUrlsBatch(
    pastCleanings.map((c: any) => ({ 
      id: c.property.id, 
      coverAssetGroupId: c.property.coverAssetGroupId || null 
    }))
  );


  return (
    <Page
      showBack
      backHref="/host/cleanings"
      title="Historial de limpiezas"
      subtitle="Revisa las limpiezas pasadas filtradas por propiedad y período."
    >

      {/* Filtros */}
      <div>
        <FilterButtons
          properties={properties}
          selectedPropertyId={selectedPropertyId}
          selectedPeriod={selectedPeriod}
          selectedStatus={selectedStatus}
        />
      </div>

      {/* Lista de limpiezas agrupadas por mes */}
      {pastCleanings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center">
          <p className="text-base text-neutral-600">
            No hay limpiezas pasadas para los filtros seleccionados.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <p className="text-xs text-neutral-500">
            {pastCleanings.length} limpieza{pastCleanings.length !== 1 ? "s" : ""} encontrada{pastCleanings.length !== 1 ? "s" : ""}
          </p>
          
          {/* Agrupar limpiezas por mes */}
          {(() => {
            // Agrupar por año-mes
            const cleaningsByMonth = new Map<string, { cleanings: typeof pastCleanings; label: string }>();
            
            pastCleanings.forEach((c: any) => {
              const date = new Date(c.scheduledDate);
              // Usar getUTC* para que scheduledDate (@db.Date = UTC midnight) agrupe
              // correctamente sin depender del TZ del servidor.
              const year = date.getUTCFullYear();
              const month = date.getUTCMonth() + 1;
              const monthKey = `${year}-${String(month).padStart(2, "0")}`;

              const monthLabel = date.toLocaleDateString("es-MX", {
                timeZone: "UTC",
                month: "long",
                year: "numeric",
              });
              
              if (!cleaningsByMonth.has(monthKey)) {
                cleaningsByMonth.set(monthKey, { cleanings: [], label: monthLabel });
              }
              cleaningsByMonth.get(monthKey)!.cleanings.push(c);
            });
            
            // Ordenar meses de más reciente a más antiguo
            const sortedMonths = Array.from(cleaningsByMonth.entries()).sort((a, b) => {
              // Comparar por año-mes (formato YYYY-MM)
              const [yearA, monthA] = a[0].split("-").map(Number);
              const [yearB, monthB] = b[0].split("-").map(Number);
              
              if (yearA !== yearB) {
                return yearB - yearA; // Año más reciente primero
              }
              return monthB - monthA; // Mes más reciente primero
            });
            
            return sortedMonths.map(([monthKey, { cleanings: monthCleanings, label: monthLabel }], monthIndex) => {
              const isFirstMonth = monthIndex === 0;
              
              return (
                <CollapsibleSection
                  key={monthKey}
                  title={monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}
                  count={monthCleanings.length}
                  defaultOpen={isFirstMonth}
                >
                  {/* Lista de limpiezas del mes */}
                  <ListContainer>
                    {monthCleanings.map((c: any, index: number) => {
                      const params = new URLSearchParams();
                      if (selectedPropertyId) params.set("propertyId", selectedPropertyId);
                      if (selectedPeriod) params.set("period", selectedPeriod);
                      if (selectedStatus) params.set("status", selectedStatus);
                      const returnTo = `/host/cleanings/history?${params.toString()}`;
                      const detailsHref = `/host/cleanings/${c.id}?returnTo=${encodeURIComponent(returnTo)}`;
                      const isLast = index === monthCleanings.length - 1;
                      const propertyName = c.property?.shortName || c.property?.name || "Propiedad no disponible";

                      return (
                        <ListRow
                          key={c.id}
                          href={detailsHref}
                          isLast={isLast}
                          ariaLabel={`Ver detalles de limpieza ${propertyName}`}
                        >
                          <ListThumb src={c.property?.id ? (thumbUrls.get(c.property.id) || null) : null} alt={propertyName} />
                          <div className="min-w-0 flex-1">
                            <h3 className="text-base font-medium text-neutral-900 truncate">
                              {c.property?.name || "Propiedad no disponible"}
                            </h3>
                            <div className="flex items-center justify-between gap-2 mt-0.5">
                              <p className="text-xs text-neutral-500 truncate">
                                {formatDateTime(c.scheduledDate)}
                              </p>
                              {(c as any).reservationId && (
                                <StopPropagationLink
                                  href={`/host/reservations/${(c as any).reservationId}`}
                                  className="text-xs text-neutral-900 underline underline-offset-2 hover:text-neutral-700 shrink-0 ml-2"
                                >
                                  Ver reserva
                                </StopPropagationLink>
                              )}
                            </div>
                            <p className="text-xs text-neutral-500 mt-1">
                              Estado: {formatStatus(c.status)}
                              {c.assignedMember && (
                                <span className="text-neutral-600">
                                  {" "}· {c.assignedMember.name}
                                </span>
                              )}
                            </p>
                            {c.notes && (
                              <p className="text-xs text-neutral-500 line-clamp-2 mt-1">
                                {c.notes}
                              </p>
                            )}
                          </div>
                        </ListRow>
                      );
                    })}
                  </ListContainer>
                </CollapsibleSection>
              );
            });
          })()}
        </div>
      )}
    </Page>
  );
}

