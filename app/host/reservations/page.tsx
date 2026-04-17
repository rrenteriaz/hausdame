// app/host/reservations/page.tsx — Vista timeline de reservas (principal)
import { notFound } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { requireHostUser } from "@/lib/auth/requireUser";
import Page from "@/lib/ui/Page";
import ReservationsTimelineGrid from "./timeline/ReservationsTimelineGrid";
import TimelineScrollContainer from "./timeline/TimelineScrollContainer";
import {
  parseMonthParam,
  buildMonthWindow,
  monthParam,
  DAY_W,
} from "./timeline/timelineUtils";

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    month?: string;
    propertyId?: string;
  }>;
}) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) notFound();

  const params = searchParams ? await searchParams : undefined;

  // ── Mes enfocado (punto de scroll inicial) ────────────────────────────────
  const { year, month } = parseMonthParam(params?.month);

  // ── Filtros ────────────────────────────────────────────────────────────────
  const propertyFilter = params?.propertyId || undefined;

  // ── Ventana amplia: 18 meses atrás + actual + 12 adelante = 31 meses ──────
  const win = buildMonthWindow(year, month, 18, 12);

  // Scroll inicial al día de hoy
  const todayUTC = new Date(
    Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())
  );
  const daysToToday = Math.round(
    (todayUTC.getTime() - win.windowStart.getTime()) / 86_400_000
  );
  const scrollToOffsetPx = Math.max(0, daysToToday) * DAY_W;

  function buildUrl(
    y: number,
    m: number,
    overrides: Record<string, string | undefined> = {}
  ): string {
    const p = new URLSearchParams();
    p.set("month", monthParam(y, m));
    const pid = "propertyId" in overrides ? overrides.propertyId : propertyFilter;
    if (pid) p.set("propertyId", pid);
    return `/host/reservations?${p.toString()}`;
  }

  // ── Datos ──────────────────────────────────────────────────────────────────
  const allProperties = await prisma.property.findMany({
    where: { tenantId },
    select: { id: true, name: true, shortName: true },
  });

  // Ordenar por nombre de display (shortName || name) alfabéticamente
  allProperties.sort((a, b) => {
    const na = (a.shortName || a.name).toLowerCase();
    const nb = (b.shortName || b.name).toLowerCase();
    return na.localeCompare(nb, "es");
  });

  const visibleProperties = propertyFilter
    ? allProperties.filter((p) => p.id === propertyFilter)
    : allProperties;

  const where: any = {
    tenantId,
    status: "CONFIRMED",
    startDate: { lt: win.windowEnd },
    endDate: { gt: win.windowStart },
  };
  if (propertyFilter) where.propertyId = propertyFilter;

  const reservations = await prisma.reservation.findMany({
    where,
    select: {
      id: true,
      propertyId: true,
      startDate: true,
      endDate: true,
      status: true,
      cleanings: {
        select: {
          id: true,
          status: true,
          needsAttention: true,
          assignedMembershipId: true,
        },
      },
    },
    orderBy: { startDate: "asc" },
  });

  return (
    <Page title="Reservas">
      <div className="space-y-3">

        {/* ── Filtros de propiedad ──────────────────────────────────────── */}
        {allProperties.length > 1 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Link
              href={buildUrl(year, month, { propertyId: undefined })}
              className={[
                "px-3 py-1.5 text-xs rounded-lg border transition-colors",
                !propertyFilter
                  ? "bg-neutral-900 text-white border-neutral-900"
                  : "border-neutral-200 text-neutral-600 hover:bg-neutral-50",
              ].join(" ")}
            >
              Todas
            </Link>
            {allProperties.map((p) => (
              <Link
                key={p.id}
                href={buildUrl(year, month, { propertyId: p.id })}
                className={[
                  "px-3 py-1.5 text-xs rounded-lg border transition-colors max-w-[130px] truncate",
                  propertyFilter === p.id
                    ? "bg-neutral-900 text-white border-neutral-900"
                    : "border-neutral-200 text-neutral-600 hover:bg-neutral-50",
                ].join(" ")}
                title={p.name}
              >
                {p.shortName || p.name}
              </Link>
            ))}
          </div>
        )}

        {/* ── Timeline — desplazamiento horizontal y vertical libre ─────── */}
        <TimelineScrollContainer scrollToOffsetPx={scrollToOffsetPx}>
          <ReservationsTimelineGrid
            properties={visibleProperties}
            reservations={reservations}
            months={win.months}
            windowStart={win.windowStart}
            windowEnd={win.windowEnd}
            totalDays={win.totalDays}
          />
        </TimelineScrollContainer>

        {/* ── Estado vacío ──────────────────────────────────────────────── */}
        {reservations.length === 0 && visibleProperties.length > 0 && (
          <p className="text-sm text-neutral-400 text-center py-2">
            Sin reservas confirmadas en el período seleccionado.
          </p>
        )}

        {/* ── Leyenda mínima ────────────────────────────────────────────── */}
        <div className="flex items-center gap-4 pt-0.5 text-xs text-neutral-400 flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-3 rounded-sm bg-neutral-800" />
            Confirmada
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
            Atención requerida
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
            Limpieza pendiente
          </span>
        </div>
      </div>
    </Page>
  );
}
