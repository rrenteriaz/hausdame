// app/host/properties/[id]/history/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { requireHostUser } from "@/lib/auth/requireUser";
import { Cleaning, Property } from "@/lib/generated/prisma";
import { getCleaningUi, getPropertyColor } from "@/lib/cleaning-ui";
import Page from "@/lib/ui/Page";
import PageHeader from "@/lib/ui/PageHeader";
import HostWebContainer from "@/lib/ui/HostWebContainer";
import { safeReturnTo } from "@/lib/navigation/safeReturnTo";

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

function formatDuration(startedAt: Date | null, completedAt: Date | null): string | null {
  if (!startedAt) return null;
  
  const end = completedAt || new Date();
  const diffMs = end.getTime() - startedAt.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;

  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

export default async function PropertyCleaningHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ returnTo?: string }>;
}) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) notFound();

  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  const property = await prisma.property.findFirst({
    where: {
      id: resolvedParams.id,
      tenantId,
    },
  });

  if (!property) notFound();

  // FASE 4: property.id ahora es el nuevo PK directamente
  // Obtener todas las limpiezas de esta propiedad, ordenadas por fecha más reciente (usar propertyId)
  const cleanings = await (prisma as any).cleaning.findMany({
    where: {
      propertyId: property.id, // FASE 4: propertyId ahora apunta directamente a Property.id
      tenantId,
    },
    orderBy: {
      scheduledDate: "desc",
    },
  });

  const typedCleanings = cleanings as Cleaning[];
  // Validar returnTo y usar fallback seguro
  // MUST: Fallback siempre a /host/properties (lista), nunca a la misma URL del detalle
  const returnTo = safeReturnTo(
    resolvedSearchParams?.returnTo ? String(resolvedSearchParams.returnTo) : undefined,
    "/host/properties"
  );
  const color = getPropertyColor(0);

  return (
    <HostWebContainer className="space-y-6">
      <header className="flex items-center justify-between">
        <PageHeader
          showBack
          backHref={returnTo}
          title="Historial de limpiezas"
          subtitle={property.name}
          variant="compact"
        />
      </header>

      {typedCleanings.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-500 text-center py-8">
            Aún no hay limpiezas registradas para esta propiedad.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-3">
          <h2 className="text-base font-semibold text-neutral-800">
            {typedCleanings.length} {typedCleanings.length === 1 ? "limpieza" : "limpiezas"}
          </h2>

          <ul className="space-y-2">
            {typedCleanings.map((cleaning) => {
              const ui = getCleaningUi(cleaning.status, color);
              const detailsHref = `/host/cleanings/${cleaning.id}?returnTo=${encodeURIComponent(returnTo)}`;
              const cleaningAny = cleaning as any;

              return (
                <li
                  key={cleaning.id}
                  className={`rounded-xl border border-neutral-200 p-3 ${ui.rowClass}`}
                >
                  <Link
                    href={detailsHref}
                    className="block -m-3 p-3 rounded-xl hover:bg-neutral-50 active:bg-neutral-100 transition"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${ui.pillClass}`}>
                            {ui.symbol}
                            {formatStatus(cleaning.status)}
                          </span>
                          {cleaningAny.startedAt && (
                            <span className="text-[10px] text-neutral-500">
                              {formatDuration(cleaningAny.startedAt, cleaningAny.completedAt) || "En progreso..."}
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-medium text-neutral-900">
                          {formatDateTime(cleaning.scheduledDate)}
                        </p>
                        {cleaning.notes && (
                          <p className="text-xs text-neutral-500 mt-1 line-clamp-2">
                            {cleaning.notes}
                          </p>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </HostWebContainer>
  );
}

