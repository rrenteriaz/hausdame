// app/host/cleanings/upcoming/page.tsx
import prisma from "@/lib/prisma";
import { requireHostUser } from "@/lib/auth/requireUser";
import Link from "next/link";
import Page from "@/lib/ui/Page";
import ListContainer from "@/lib/ui/ListContainer";
import ListRow from "@/lib/ui/ListRow";
import ListThumb from "@/lib/ui/ListThumb";
import { getCoverThumbUrlsBatch } from "@/lib/media/getCoverThumbUrl";
import StopPropagationLink from "@/lib/ui/StopPropagationLink";

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
  return date.toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function UpcomingCleaningsPage({
  searchParams,
}: {
  searchParams?: Promise<{ month?: string; date?: string; view?: string }>;
}) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  const params = searchParams ? await searchParams : undefined;

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

  const now = new Date();

  // Obtener limpiezas próximas (PENDING o IN_PROGRESS, scheduledDate >= now)
  const upcomingCleanings = await (prisma as any).cleaning.findMany({
    where: {
      tenantId,
      status: { in: ["PENDING", "IN_PROGRESS"] },
      scheduledDate: { gte: now },
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
          team: true,
        },
      },
    },
    orderBy: { scheduledDate: "asc" },
  });

  // Obtener thumbnails en batch para propiedades de las limpiezas próximas
  const upcomingThumbUrls = await getCoverThumbUrlsBatch(
    upcomingCleanings.map((c: any) => ({
      id: c.property.id,
      coverAssetGroupId: c.property.coverAssetGroupId || null,
    }))
  );

  // Construir returnTo para navegación de regreso
  const buildReturnTo = () => {
    const baseParams = new URLSearchParams();
    if (params?.view) baseParams.set("view", params.view);
    if (params?.date) baseParams.set("date", params.date);
    if (params?.month) baseParams.set("month", params.month);
    return `/host/cleanings/upcoming${baseParams.toString() ? `?${baseParams.toString()}` : ""}`;
  };

  return (
    <Page
      showBack
      backHref="/host/cleanings"
      title="Próximas limpiezas"
      subtitle="Limpiezas programadas pendientes o en progreso."
    >
      {upcomingCleanings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center">
          <p className="text-base text-neutral-600">
            No hay limpiezas próximas.
            <br />
            <Link
              href="/host/cleanings"
              className="text-base text-neutral-900 underline underline-offset-2 hover:text-neutral-700 mt-2 inline-block"
            >
              Volver a limpiezas
            </Link>
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <p className="text-xs text-neutral-500">
            {upcomingCleanings.length} limpieza{upcomingCleanings.length !== 1 ? "s" : ""} próxima{upcomingCleanings.length !== 1 ? "s" : ""}
          </p>

          <ListContainer>
            {upcomingCleanings.map((c: any, index: number) => {
              const returnTo = buildReturnTo();
              const detailsHref = `/host/cleanings/${c.id}?returnTo=${encodeURIComponent(returnTo)}`;
              const isLast = index === upcomingCleanings.length - 1;
              const propertyName = c.property?.shortName || c.property?.name || "Propiedad no disponible";

              return (
                <ListRow
                  key={c.id}
                  href={detailsHref}
                  isLast={isLast}
                  ariaLabel={`Ver detalles de limpieza ${propertyName}`}
                >
                  <ListThumb
                    src={c.property?.id ? (upcomingThumbUrls.get(c.property.id) || null) : null}
                    alt={propertyName}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-base font-medium text-neutral-900 truncate">
                        {c.property?.name || "Propiedad no disponible"}
                      </h3>
                    </div>
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
                      {(c as any).assignmentStatus === "OPEN" && !c.assignedMember && (
                        <>
                          <span className="text-amber-600"> · Disponible</span>
                          {(c as any).viewsCount > 0 && (
                            <span className="text-xs text-neutral-500 ml-1">
                              👁 {(c as any).viewsCount}
                            </span>
                          )}
                        </>
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
        </div>
      )}
    </Page>
  );
}

