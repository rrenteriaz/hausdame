// app/cleaner/history/page.tsx
import { getCurrentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getCleanerCleaningsList } from "@/lib/cleaner/cleanings/query";
import { formatCleaningStatus } from "@/lib/cleaning-ui";
import Page from "@/lib/ui/Page";
import ListContainer from "@/lib/ui/ListContainer";
import ListRow from "@/lib/ui/ListRow";
import ListThumb from "@/lib/ui/ListThumb";
import { getCoverThumbUrlsBatch } from "@/lib/media/getCoverThumbUrl";
import prisma from "@/lib/prisma";
import HistoryFilters from "./HistoryFilters";
import { formatDateOnly } from "@/lib/ui/formatDateOnly";
import { getCdmxDate } from "@/lib/datetime/cdmxToday";

export default async function CleanerHistoryPage({
  searchParams,
}: {
  searchParams?: Promise<{ memberId?: string; propertyId?: string; period?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const memberIdParam = params?.memberId;
  const propertyIdFilter = params?.propertyId;
  const periodFilter = params?.period || "last_7_days";

  let user;
  let context;
  try {
    user = await getCurrentUser();
    if (!user || user.role !== "CLEANER") {
      redirect("/login");
      return;
    }

    // Calcular rango de fechas según el filtro de período.
    // Usar Date.UTC + getCdmxDate() para que los límites sean UTC midnight del día CDMX
    // correcto, independientemente del TZ del servidor.
    // scheduledDate es @db.Date → Prisma compara solo la parte DATE, nunca la hora.
    const { year, month, day } = getCdmxDate();
    let scheduledDateFrom: Date | undefined;
    let scheduledDateTo: Date | undefined;

    if (periodFilter === "last_7_days") {
      scheduledDateFrom = new Date(Date.UTC(year, month, day - 7));
    } else if (periodFilter === "last_month") {
      scheduledDateFrom = new Date(Date.UTC(year, month, 1));
    } else if (periodFilter === "previous_month") {
      scheduledDateFrom = new Date(Date.UTC(year, month - 1, 1));
      // Date.UTC con day=0 da el último día del mes anterior
      scheduledDateTo = new Date(Date.UTC(year, month, 0));
    }

    // Usar query layer canónico con scope history (incluye REMOVED y omite property filter actual)
    const { cleanings, scope } = await getCleanerCleaningsList(
      {
        scope: "history",
        propertyId: propertyIdFilter,
        scheduledDateFrom,
        scheduledDateTo,
        status: ["COMPLETED"],
      }
    );

    if (cleanings.length === 0 && scope.membershipIds.length === 0) {
      redirect("/cleaner");
      return;
    }

    // Obtener propiedades únicas para el filtro
    const propertiesMap = new Map<string, any>();
    
    // 1. Propiedades con historial real
    cleanings.forEach((c: any) => {
      if (c.property && !propertiesMap.has(c.property.id)) {
        propertiesMap.set(c.property.id, c.property);
      }
    });

    // 2. Propiedades con acceso actual
    if (scope.propertyIds.length > 0) {
      const currentProperties = await prisma.property.findMany({
        where: { id: { in: scope.propertyIds }, isActive: true },
        select: { id: true, name: true, shortName: true }
      });
      currentProperties.forEach(p => {
        if (!propertiesMap.has(p.id)) propertiesMap.set(p.id, p);
      });
    }

    const availableProperties = Array.from(propertiesMap.values());

    const completedCleanings = cleanings.sort((a: any, b: any) => {
      const dateA = a.completedAt || a.scheduledDate;
      const dateB = b.completedAt || b.scheduledDate;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });

    const thumbUrls = completedCleanings.length > 0
      ? await getCoverThumbUrlsBatch(
          completedCleanings.map((c: any) => ({
            id: c.property.id,
            coverAssetGroupId: c.property.coverAssetGroupId || null,
          }))
        ) 
      : new Map<string, string | null>();

    const buildReturnTo = () => {
      const urlParams = new URLSearchParams();
      if (memberIdParam) urlParams.set("memberId", memberIdParam);
      if (propertyIdFilter) urlParams.set("propertyId", propertyIdFilter);
      if (periodFilter && periodFilter !== "last_7_days") urlParams.set("period", periodFilter);
      return `/cleaner/history${urlParams.toString() ? `?${urlParams.toString()}` : ""}`;
    };

    return (
      <Page title="Historial" containerClassName="pt-6">
        <HistoryFilters
          properties={availableProperties}
          selectedPropertyId={propertyIdFilter}
          selectedPeriod={periodFilter}
          memberId={memberIdParam}
        />

        {completedCleanings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-4 text-center text-base text-neutral-600">
            No hay limpiezas completadas en los filtros seleccionados.
          </div>
        ) : (
          <ListContainer>
            {completedCleanings.map((cleaning: any, index: number) => {
              const isLast = index === completedCleanings.length - 1;
              const propertyName = cleaning.property.shortName || cleaning.property.name;
              const returnTo = buildReturnTo();
              const detailsHref = `/cleaner/cleanings/${cleaning.id}?memberId=${encodeURIComponent(memberIdParam || "")}&returnTo=${encodeURIComponent(returnTo)}`;
              
              return (
                <ListRow
                  key={cleaning.id}
                  href={detailsHref}
                  isLast={isLast}
                  ariaLabel={`Ver detalles de limpieza ${propertyName}`}
                >
                  <ListThumb src={thumbUrls.get(cleaning.property.id) || null} alt={propertyName} />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-medium text-neutral-900 truncate">
                      {propertyName}
                    </h3>
                    <p className="text-xs text-neutral-500 truncate mt-0.5">
                      {cleaning.completedAt
                        ? new Date(cleaning.completedAt).toLocaleString("es-MX", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : formatDateOnly(new Date(cleaning.scheduledDate))}
                    </p>
                    <p className="text-xs text-neutral-500 mt-1">
                      Estado: {formatCleaningStatus(cleaning.status)}
                    </p>
                  </div>
                </ListRow>
              );
            })}
          </ListContainer>
        )}
      </Page>
    );
  } catch (error) {
    console.error("Error loading cleaner history:", error);
    redirect("/cleaner");
    return;
  }
}

