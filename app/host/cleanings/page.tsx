// app/host/cleanings/page.tsx
import { Suspense } from "react";
import prisma from "@/lib/prisma";
import { requireHostUser } from "@/lib/auth/requireUser";
import { CleaningStatus, Cleaning, Property } from "@/lib/generated/prisma";
import Link from "next/link";
import { getCleaningUi, getPropertyColor } from "@/lib/cleaning-ui";
import { getHostVisual, hostKindFromCleaning, HOST_LEGEND, firstNameOf, truncateBadge } from "@/lib/ui/cleaning-visual-state";
import { startCleaning, completeCleaning, cancelCleaning, reopenCleaning } from "./actions";
import DailyCleaningsViewWithModal from "./DailyCleaningsViewWithModal";
import CreateCleaningForm from "./CreateCleaningForm";
import CollapsibleSection from "@/lib/ui/CollapsibleSection";
import Page from "@/lib/ui/Page";
import ListContainer from "@/lib/ui/ListContainer";
import ListRow from "@/lib/ui/ListRow";
import ListThumb from "@/lib/ui/ListThumb";
import { getCoverThumbUrlsBatch } from "@/lib/media/getCoverThumbUrl";
import StopPropagationLink from "@/lib/ui/StopPropagationLink";
import BackChevron from "@/lib/ui/BackChevron";
import { getCleaningsNeedingAttentionCount } from "@/lib/cleaning-needs-attention";
import CleaningsViewShell from "./CleaningsViewShell";
import HostWebContainer from "@/lib/ui/HostWebContainer";
import { getCdmxDate } from "@/lib/datetime/cdmxToday";
import { isPastDateOnly } from "@/lib/datetime/isPastDateOnly";
import { formatDateOnly } from "@/lib/ui/formatDateOnly";

export default async function CleaningsPage({
    searchParams,
  }: {
    searchParams?: Promise<{ month?: string; view?: string; date?: string; confirm?: string; cleaningId?: string }>;
  }) {
  
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("Usuario sin tenant asociado");

  // Manejar searchParams como Promise
  const params = searchParams ? await searchParams : undefined;

    // Fecha base: hoy o la dada por ?date=YYYY-MM-DD
    const today = new Date();
    let referenceDate = today;
  
    const dateParam = params?.date;
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      const [yStr, mStr, dStr] = dateParam.split("-");
      const y = Number(yStr);
      const m = Number(mStr) - 1;
      const d = Number(dStr);
      const candidate = new Date(y, m, d);
      if (!Number.isNaN(candidate.getTime())) {
        referenceDate = candidate;
      }
    }
  
    // Fecha de referencia para el calendario mensual
    let monthDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  
    const monthParam = params?.month;
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [yearStr, monthStr] = monthParam.split("-");
      const year = Number(yearStr);
      const monthNum = Number(monthStr);
      const monthIndex = monthNum - 1; // 0-11
      // Validar que el mes esté en rango válido (1-12)
      if (!Number.isNaN(year) && !Number.isNaN(monthNum) && monthNum >= 1 && monthNum <= 12) {
        monthDate = new Date(year, monthIndex, 1);
      }
    }
  

  // Vista inicial: day | week | month (por defecto month) - solo para inicializar el shell
  const rawView = params?.view;
  const initialView: "day" | "week" | "month" =
    rawView === "day" || rawView === "week" || rawView === "month"
      ? rawView
      : "month";

  // Calcular rango de fechas para el mes (con padding semanal)
  // Mes completo + semanas parciales al inicio y final para el grid del calendario
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth(); // 0-11
  
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0); // Último día del mes
  
  // Inicio de semana del primer día del mes (domingo = 0)
  const startWeekday = monthStart.getDay();
  const rangeStart = new Date(monthStart);
  rangeStart.setDate(monthStart.getDate() - startWeekday); // Retroceder al domingo de esa semana
  
  // Fin de semana del último día del mes + 1 día (para usar lt en Prisma)
  const endWeekday = monthEnd.getDay();
  const daysToAdd = 6 - endWeekday; // Días hasta el sábado
  const rangeEndExclusive = new Date(monthEnd);
  rangeEndExclusive.setDate(monthEnd.getDate() + daysToAdd + 1); // +1 para usar lt en Prisma

  const [properties, cleaningsRaw] = await Promise.all([
    prisma.property.findMany({
      where: { 
        tenantId,
        ...({ isActive: true } as any), // Solo propiedades activas
      },
      select: {
        id: true,
        name: true,
        shortName: true,
        isActive: true,
      },
      orderBy: { name: "asc" },
    }),
    (prisma as any).cleaning.findMany({
      where: {
        tenantId,
        status: { not: "CANCELLED" },
        scheduledDate: {
          gte: rangeStart,
          lt: rangeEndExclusive,
        },
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
      // Eliminado take: 200 - ahora filtramos por rango
    }),
  ]);

  // Obtener conteos de vistas por cleaningId usando groupBy (optimizado)
  const cleaningIds = cleaningsRaw.map((c: any) => c.id);
  const viewsCountMap = new Map<string, number>();
  
  if (cleaningIds.length > 0) {
    try {
      // Usar groupBy para contar en la base de datos (mucho más eficiente)
      const viewCounts = await (prisma as any).cleaningView.groupBy({
        by: ["cleaningId"],
        where: {
          tenantId,
          cleaningId: { in: cleaningIds },
        },
        _count: {
          cleaningId: true,
        },
      });
      
      // Construir mapa desde el resultado de groupBy
      if (viewCounts && Array.isArray(viewCounts)) {
        viewCounts.forEach((row: any) => {
          if (row && row.cleaningId) {
            viewsCountMap.set(row.cleaningId, row._count.cleaningId || 0);
          }
        });
      }
    } catch (error: any) {
      // Si el modelo no existe o hay algún error, simplemente continuar sin conteos
      console.error("[CleaningsPage] Error obteniendo conteos de vistas:", error?.message || error);
      // No lanzar el error, simplemente usar mapa vacío
    }
  }

  // Agregar viewsCount a cada cleaning
  const cleanings = cleaningsRaw.map((c: any) => {
    const viewsCount = viewsCountMap.get(c.id) || 0;
    return {
      ...c,
      viewsCount,
    };
  });

  const now = new Date();

  const upcomingCleanings = cleanings.filter(
    (c: any) =>
      (c.status === "PENDING" || c.status === "IN_PROGRESS") &&
      !isPastDateOnly(new Date(c.scheduledDate))
  );

  // Obtener thumbnails en batch para propiedades de las limpiezas próximas
  const upcomingThumbUrls = await getCoverThumbUrlsBatch(
    upcomingCleanings.map((c: any) => ({ 
      id: c.property.id, 
      coverAssetGroupId: c.property.coverAssetGroupId || null 
    }))
  );

  const pastCleanings = cleanings.filter(
    (c: any) =>
      isPastDateOnly(new Date(c.scheduledDate)) ||
      c.status === "COMPLETED" ||
      c.status === "CANCELLED"
  );

  // Limpiezas que requieren atención (usar función helper centralizada)
  const cleaningsNeedingAttentionCount = await getCleaningsNeedingAttentionCount(tenantId);

  const hasProperties = properties.length > 0;

  // Helper para construir enlaces conservando el mes y la fecha
  const monthParamForLinks = `${monthDate.getFullYear()}-${String(
    monthDate.getMonth() + 1
  ).padStart(2, "0")}`;
  const dateParamForLinks = `${referenceDate.getFullYear()}-${String(
    referenceDate.getMonth() + 1
  ).padStart(2, "0")}-${String(referenceDate.getDate()).padStart(2, "0")}`;

  // Helper para construir returnTo para los detalles (usa initialView para compatibilidad)
  const buildReturnTo = () => {
    const baseParams = new URLSearchParams();
    baseParams.set("view", initialView);
    if (dateParamForLinks) baseParams.set("date", dateParamForLinks);
    if (monthParamForLinks) baseParams.set("month", monthParamForLinks);
    return `/host/cleanings?${baseParams.toString()}`;
  };

  return (
    <div className="space-y-6">
      <HostWebContainer className="space-y-6">
        {/* Encabezado */}
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Limpiezas
          </h1>
          <p className="text-base text-neutral-600">
            Crea y revisa las limpiezas de tus propiedades.
          </p>
        </header>

        {/* Banner de alertas */}
        {cleaningsNeedingAttentionCount > 0 && (
          <Link href="/host/cleanings/needs-attention" className="block">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 hover:bg-amber-100 transition cursor-pointer lg:rounded-xl lg:p-3">
              <div className="flex items-start gap-3">
                <span className="text-xl">⚠️</span>
                <div className="flex-1">
                  <p className="text-base font-semibold text-amber-900">
                    {cleaningsNeedingAttentionCount} limpieza{cleaningsNeedingAttentionCount > 1 ? "s" : ""} requiere{cleaningsNeedingAttentionCount > 1 ? "n" : ""} atención
                  </p>
                  <p className="text-xs text-amber-700 mt-1">
                    Algunas limpiezas no tienen cleaner asignado o el horario no es compatible.
                  </p>
                </div>
                <span className="text-amber-600 shrink-0">→</span>
              </div>
            </div>
          </Link>
        )}

        {/* Calendario / vistas - Usar shell cliente para cambios instantáneos */}
        <Suspense fallback={<div className="min-h-[400px] animate-pulse rounded-2xl bg-neutral-100" />}>
          <CleaningsViewShell
            key={`${initialView}-${dateParamForLinks}`}
            cleanings={cleanings as CleaningWithProperty[]}
            properties={properties}
            referenceDate={referenceDate}
            monthDate={monthDate}
            monthParamForLinks={monthParamForLinks}
            dateParamForLinks={dateParamForLinks}
            initialView={initialView}
            MonthlyCleaningsCalendar={
              <MonthlyCleaningsCalendar
                cleanings={cleanings as CleaningWithProperty[]}
                properties={properties}
                monthDate={monthDate}
              />
            }
            WeeklyCleaningsView={
              <WeeklyCleaningsView
                cleanings={cleanings as CleaningWithProperty[]}
                properties={properties}
                referenceDate={referenceDate}
              />
            }
          />
        </Suspense>

        {/* KPI Cards (solo web) */}
        <section className="hidden lg:grid grid-cols-2 gap-4">
          <Link
            href={`/host/cleanings/upcoming?month=${monthParamForLinks}&date=${dateParamForLinks}&view=${initialView}`}
            className="rounded-xl border border-neutral-200 bg-white p-4 text-left hover:bg-neutral-50 hover:border-neutral-300 active:scale-[0.98] transition-all"
          >
            <p className="text-xs text-neutral-500 mb-1">Próximas limpiezas</p>
            <p className="text-2xl font-semibold text-neutral-900">
              {upcomingCleanings.length}
            </p>
            <p className="text-[10px] text-neutral-400 mt-0.5">Próximos días</p>
          </Link>
          <Link
            href="/host/cleanings/history"
            className="rounded-xl border border-neutral-200 bg-white p-4 text-left hover:bg-neutral-50 hover:border-neutral-300 active:scale-[0.98] transition-all"
          >
            <p className="text-xs text-neutral-500 mb-1">Historial de limpiezas</p>
            <p className="text-2xl font-semibold text-neutral-900">
              {pastCleanings.length}
            </p>
            <p className="text-[10px] text-neutral-400 mt-0.5">Completadas</p>
          </Link>
        </section>

        {/* Botón para agregar limpieza (solo web, alineado al calendario) */}
        <div className="hidden lg:flex justify-end">
          <CreateCleaningForm properties={properties} />
        </div>
      </HostWebContainer>

      {/* Botón para agregar limpieza */}
      <div className="flex justify-end lg:hidden">
        <CreateCleaningForm properties={properties} />
      </div>

      {/* Lista (Próximas / Pasadas) - Solo mobile */}
      <section className="space-y-6 lg:hidden">
        {/* Próximas limpiezas */}
        <div id="upcoming-cleanings-mobile">
          <CollapsibleSection title="Próximas limpiezas" count={upcomingCleanings.length} defaultOpen={false}>
          {upcomingCleanings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-4 text-center text-base text-neutral-600">
              No hay limpiezas próximas.
              <br />
              Usa el botón "Agregar limpieza" para agregar una nueva.
            </div>
          ) : (
              <ListContainer>
                {upcomingCleanings.map((c: any, index: number) => {
                  const returnTo = buildReturnTo();
                  const detailsHref = `/host/cleanings/${c.id}?returnTo=${encodeURIComponent(returnTo)}`;
                  const isLast = index === upcomingCleanings.length - 1;
                  const propertyName = c.property.shortName || c.property.name;
                  
                  return (
                    <ListRow
                      key={c.id}
                      href={detailsHref}
                      isLast={isLast}
                      ariaLabel={`Ver detalles de limpieza ${propertyName}`}
                    >
                      <ListThumb src={upcomingThumbUrls.get(c.property.id) || null} alt={propertyName} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-base font-medium text-neutral-900 truncate">
                            {c.property.name}
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
                        {/* Estado visual */}
                        {(() => {
                          const kind = hostKindFromCleaning({
                            status: c.status,
                            assignmentStatus: (c as any).assignmentStatus,
                            assignedMembershipId: (c as any).assignedMembershipId,
                          });
                          const visual = getHostVisual(kind);
                          const assignedMember = (c as any).assignedMember;
                          const needsAttention = (c as any).needsAttention;
                          return (
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${visual.badgeBg} ${visual.badgeTextColor}`}>
                                {kind === "assigned_pending" && assignedMember?.name
                                  ? `👤 ${firstNameOf(assignedMember.name) ?? assignedMember.name}`
                                  : visual.badgeFull}
                              </span>
                              {(c as any).viewsCount > 0 && kind === "unassigned" && (
                                <span className="text-xs text-neutral-400">
                                  👁 {(c as any).viewsCount}
                                </span>
                              )}
                              {needsAttention && c.status !== "IN_PROGRESS" && c.status !== "COMPLETED" && (
                                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700">
                                  ⚠ Atención
                                </span>
                              )}
                            </div>
                          );
                        })()}
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
            )}
          </CollapsibleSection>
        </div>

          {/* Historial de limpiezas */}
          <div id="cleanings-history" className="space-y-3">
            <Link
              href="/host/cleanings/history"
              className="flex items-center justify-between py-2 group hover:opacity-80 transition-opacity"
            >
              <h2 className="text-base font-semibold text-neutral-800">
                Historial de limpiezas{pastCleanings.length > 0 ? ` (${pastCleanings.length})` : ""}
              </h2>
              <svg
                className="w-4 h-4 text-neutral-400 group-hover:text-neutral-600 transition-colors"
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
            </Link>
          </div>
        </section>
    </div>
  );
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

function formatDate(date: Date) {
  return date.toLocaleString("es-MX", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

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

type PropertyListItem = Pick<Property, "id" | "name" | "shortName" | "isActive">;

type CleaningWithProperty = Cleaning & { 
  property: Property;
  startedAt?: Date | null;
  completedAt?: Date | null;
};

/**
 * Vista mensual del calendario con navegación por meses.
 */
function MonthlyCleaningsCalendar({
  cleanings,
  properties,
  monthDate,
}: {
  cleanings: CleaningWithProperty[];
  properties: PropertyListItem[];
  monthDate: Date;
}) {
  const { year: todayYear, month: todayMonth, day: todayDay } = getCdmxDate();
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth(); // 0-11

  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  const startWeekday = monthStart.getDay(); // 0=dom
  const daysInMonth = monthEnd.getDate();

  // Mes anterior y siguiente
  const prevMonthDate = new Date(year, month - 1, 1);
  const nextMonthDate = new Date(year, month + 1, 1);

  const formatMonthParam = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

  const formatDateParam = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;

  const rawMonth = monthStart.toLocaleString("es-MX", {
    month: "long",
  });
  const monthName =
    rawMonth.charAt(0).toUpperCase() + rawMonth.slice(1) + ` ${year}`;

  const weekdayLabels = ["D", "L", "M", "M", "J", "V", "S"];

  // Colores fijos por propiedad
  const colorClasses = [
    "bg-emerald-500",
    "bg-sky-500",
    "bg-amber-500",
    "bg-fuchsia-500",
    "bg-rose-500",
    "bg-slate-500",
  ] as const;

  // Mapa de colores sólidos para los puntos
  const colorToHex: Record<string, string> = {
    "bg-emerald-500": "#10b981",
    "bg-sky-500": "#0ea5e9",
    "bg-amber-500": "#f59e0b",
    "bg-fuchsia-500": "#d946ef",
    "bg-rose-500": "#f43f5e",
    "bg-slate-500": "#64748b",
  };

  // FASE 4: Crear mapas de colores usando id como clave (propertyId ahora apunta directamente a Property.id)
  const propertyColorMap = new Map<string, string>();
  const propertyColorHexMap = new Map<string, string>();
  properties.forEach((p, index) => {
    const color = colorClasses[index % colorClasses.length];
    // FASE 4: property.id ahora es el nuevo PK directamente
    if (p.id) {
      propertyColorMap.set(p.id, color);
      propertyColorHexMap.set(p.id, colorToHex[color] || "#64748b");
    }
  });

  // Agrupar limpiezas por día
  const cleaningsByDay = new Map<string, CleaningWithProperty[]>();

  cleanings.forEach((c) => {
    const d = c.scheduledDate;
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const list = cleaningsByDay.get(key) ?? [];
    list.push(c);
    cleaningsByDay.set(key, list);
  });

  const weeks: Array<Array<{ date: Date | null }>> = [];
  let currentWeek: Array<{ date: Date | null }> = [];

  // Huecos antes del día 1
  for (let i = 0; i < startWeekday; i++) {
    currentWeek.push({ date: null });
  }

  // Días del mes
  for (let day = 1; day <= daysInMonth; day++) {
    currentWeek.push({ date: new Date(year, month, day) });

    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  // Última semana incompleta
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push({ date: null });
    }
    weeks.push(currentWeek);
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-3 sm:p-4">
      {/* Encabezado del calendario con navegación */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Link
            href={`/host/cleanings?month=${formatMonthParam(
              prevMonthDate
            )}&view=month`}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-neutral-300 text-xs text-neutral-700 hover:bg-neutral-100"
          >
            ←
          </Link>
          <p className="text-base font-medium text-neutral-800">
            {monthName}
          </p>
          <Link
            href={`/host/cleanings?month=${formatMonthParam(
              nextMonthDate
            )}&view=month`}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-neutral-300 text-xs text-neutral-700 hover:bg-neutral-100"
          >
            →
          </Link>
        </div>
        <p className="text-xs text-neutral-500">Vista mensual</p>
      </div>

      {/* Cabeceras de días */}
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] sm:text-sm text-neutral-500 mb-1">
        {weekdayLabels.map((label, index) => (
          <div key={`weekday-${index}`} className="py-1">
            {label}
          </div>
        ))}
      </div>

      {/* Celdas del calendario */}
      <div className="grid grid-cols-7 gap-1 pb-3 sm:pb-4">
        {weeks.map((week, wi) =>
          week.map((cell, di) => {
            const date = cell.date;
            if (!date) {
              return (
                <div
                  key={`${wi}-${di}`}
                  className="h-[72px] sm:h-[88px] rounded-xl border border-transparent bg-transparent"
                />
              );
            }

            const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
            const dayCleanings = cleaningsByDay.get(key) ?? [];

            const isToday =
              date.getFullYear() === todayYear &&
              date.getMonth() === todayMonth &&
              date.getDate() === todayDay;

            // ── Estilo de celda: ámbar solo para atención real; vencidas usan punto rojo ──
            const hasAttention = dayCleanings.some(c => {
              // IN_PROGRESS y COMPLETED tienen prioridad visual absoluta
              if (c.status === "IN_PROGRESS" || c.status === "COMPLETED") return false;
              const k = hostKindFromCleaning({
                status: c.status,
                assignmentStatus: (c as any).assignmentStatus,
                assignedMembershipId: (c as any).assignedMembershipId,
                scheduledDate: c.scheduledDate,
              });
              // Vencidas usan punto rojo; el borde ámbar es solo para atención operativa
              if (k === "overdue") return false;
              if ((c as any).needsAttention) return true;
              return k === "unassigned";
            });
            const cellBorder = isToday
              ? "border-black"
              : hasAttention
                ? "border-amber-300"
                : "border-neutral-200";

            const MAX_CHIPS = 4;
            const visible = dayCleanings.slice(0, MAX_CHIPS);
            const overflow = dayCleanings.length - MAX_CHIPS;

            return (
              <Link
                key={`${wi}-${di}`}
                href={`/host/cleanings?view=day&date=${formatDateParam(date)}`}
                className="block focus:outline-none"
              >
                <div
                  className={`h-[72px] sm:h-[88px] rounded-xl border ${cellBorder} bg-white p-1 flex flex-col gap-[2px] hover:border-neutral-400 transition`}
                >
                  {/* Número del día */}
                  <span className={`text-[10px] font-medium leading-none self-start ${isToday ? "bg-black text-white rounded-full w-4 h-4 flex items-center justify-center text-[9px]" : "text-neutral-700"}`}>
                    {date.getDate()}
                  </span>

                  {/* Chips de propiedades */}
                  <div className="flex-1 flex flex-col gap-[2px] overflow-hidden">
                    {visible.map((c) => {
                      const kind = hostKindFromCleaning({
                        status: c.status,
                        assignmentStatus: (c as any).assignmentStatus,
                        assignedMembershipId: (c as any).assignedMembershipId,
                        scheduledDate: c.scheduledDate,
                      });
                      const isAttention =
                        kind !== "overdue" &&
                        c.status !== "IN_PROGRESS" && c.status !== "COMPLETED" &&
                        ((c as any).needsAttention || kind === "unassigned");
                      const name = c.property.shortName || c.property.name;

                      if (isAttention) return (
                        <span key={c.id} className="rounded px-1 py-[1px] text-[7px] sm:text-[11px] font-medium leading-tight truncate self-start max-w-full bg-amber-100 text-amber-900" title={name}>
                          {name}
                        </span>
                      );
                      if (kind === "in_progress") return (
                        <span key={c.id} className="rounded px-1 py-[1px] text-[7px] sm:text-[11px] font-bold leading-tight truncate self-start max-w-full bg-emerald-100 text-emerald-800" title={name}>
                          {name}
                        </span>
                      );
                      if (kind === "completed") return (
                        <span key={c.id} className="rounded px-1 py-[1px] text-[7px] sm:text-[11px] font-medium leading-tight truncate self-start max-w-full bg-emerald-50 text-emerald-700" title={name}>
                          {name}
                        </span>
                      );
                      if (kind === "overdue") return (
                        <span key={c.id} className="rounded px-1 py-[1px] text-[7px] sm:text-[11px] leading-tight truncate block w-fit max-w-full bg-red-50 text-red-700" title={name}>
                          {name}
                        </span>
                      );
                      return (
                        <span key={c.id} className="px-1 py-[1px] text-[7px] sm:text-[11px] leading-tight truncate block text-neutral-700" title={name}>
                          {name}
                        </span>
                      );
                    })}
                    {overflow > 0 && (
                      <span className="text-[8px] text-neutral-400 leading-none pl-0.5">
                        +{overflow}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>

      {/* Leyenda */}
      <div className="border-t border-neutral-100 pt-3 mt-1">
        <p className="text-[9px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">Leyenda</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1.5">
          <div className="flex items-center gap-1">
            <span className="rounded px-1.5 py-0.5 text-[9px] font-medium bg-amber-100 text-amber-900">Abc</span>
            <span className="text-[9px] text-neutral-500">Requiere atención</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="px-1.5 py-0.5 text-[9px] text-neutral-700">Abc</span>
            <span className="text-[9px] text-neutral-500">Asignada</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="rounded px-1.5 py-0.5 text-[9px] bg-red-50 text-red-700">Abc</span>
            <span className="text-[9px] text-neutral-500">Vencida</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="rounded px-1.5 py-0.5 text-[9px] font-bold bg-emerald-100 text-emerald-800">Abc</span>
            <span className="text-[9px] text-neutral-500">En progreso</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="rounded px-1.5 py-0.5 text-[9px] font-medium bg-emerald-50 text-emerald-700">Abc</span>
            <span className="text-[9px] text-neutral-500">Completada</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Vista semanal: semana de la fecha de referencia (dom - sáb).
 */
function WeeklyCleaningsView({
  cleanings,
  properties,
  referenceDate,
}: {
  cleanings: CleaningWithProperty[];
  properties: PropertyListItem[];
  referenceDate: Date;
}) {
  const ref = new Date(referenceDate);
  const weekStart = new Date(ref);
  weekStart.setDate(ref.getDate() - ref.getDay()); // domingo

  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    days.push(d);
  }

  const formatDateParam = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const cleaningsByDay = new Map<string, CleaningWithProperty[]>();
  cleanings.forEach((c) => {
    const d = c.scheduledDate;
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const list = cleaningsByDay.get(key) ?? [];
    list.push(c);
    cleaningsByDay.set(key, list);
  });

  const { year: twY, month: twM, day: twD } = getCdmxDate();
  const isTodayWeek =
    referenceDate.getFullYear() === twY &&
    referenceDate.getMonth() === twM &&
    referenceDate.getDate() === twD;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-3 sm:p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-neutral-600">
          Semana del {formatDate(weekStart)}
        </p>
        <p className="text-xs text-neutral-500">
          Vista semanal{isTodayWeek ? " (hoy)" : ""}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-7 gap-2 text-[11px]">
        {days.map((date, i) => {
          const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
          const dayCleanings = cleaningsByDay.get(key) ?? [];

          const { year: dY, month: dM, day: dD } = getCdmxDate();
          const isToday =
            date.getFullYear() === dY &&
            date.getMonth() === dM &&
            date.getDate() === dD;

          return (
            <Link
              key={i}
              href={`/host/cleanings?view=day&date=${formatDateParam(date)}`}
              className={`block rounded-xl border p-2 flex flex-col gap-1 transition-colors hover:bg-neutral-50 hover:border-neutral-300 ${
                isToday ? "border-black bg-neutral-50" : "border-neutral-200 bg-white"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-neutral-800">
                  {date.toLocaleString("es-MX", {
                    weekday: "short",
                  })}
                </span>
                <span className="text-[10px] text-neutral-500">
                  {date.getDate()}/{date.getMonth() + 1}
                </span>
              </div>

              {dayCleanings.length === 0 ? (
                <p className="text-[10px] text-neutral-400 mt-1">
                  Sin limpiezas
                </p>
              ) : (
                <div className="flex flex-col gap-[3px] mt-1">
                  {dayCleanings.map((c) => {
                    const label = c.property.shortName || c.property.name;
                    const kind = hostKindFromCleaning({
                      status: c.status,
                      assignmentStatus: (c as any).assignmentStatus,
                      assignedMembershipId: (c as any).assignedMembershipId,
                      scheduledDate: c.scheduledDate,
                    });
                    const isAttention =
                      kind !== "overdue" &&
                      c.status !== "IN_PROGRESS" && c.status !== "COMPLETED" &&
                      ((c as any).needsAttention || kind === "unassigned");

                    if (isAttention) {
                      return (
                        <span key={c.id} className="rounded px-1 py-[2px] text-[10px] font-medium leading-tight truncate self-start max-w-full bg-amber-100 text-amber-900" title={label}>
                          {label}
                        </span>
                      );
                    }
                    if (kind === "in_progress") {
                      return (
                        <span key={c.id} className="rounded px-1 py-[2px] text-[10px] font-bold leading-tight truncate self-start max-w-full bg-emerald-100 text-emerald-800" title={label}>
                          {label}
                        </span>
                      );
                    }
                    if (kind === "completed") {
                      return (
                        <span key={c.id} className="rounded px-1 py-[2px] text-[10px] font-medium leading-tight truncate self-start max-w-full bg-emerald-50 text-emerald-700" title={label}>
                          {label}
                        </span>
                      );
                    }
                    if (kind === "overdue") {
                      return (
                        <span key={c.id} className="rounded px-1 py-[2px] text-[10px] leading-tight truncate self-start max-w-full bg-red-50 text-red-700" title={label}>
                          {label}
                        </span>
                      );
                    }
                    // Asignada → neutro con nombre (+ cleaner si existe)
                    const assigneeName = firstNameOf((c as any).assignedMember?.name ?? (c as any).TeamMembership?.User?.name);
                    return (
                      <span key={c.id} className="px-1 py-[2px] text-[10px] leading-tight truncate block text-neutral-700" title={label}>
                        {label}{assigneeName ? ` · ${truncateBadge(assigneeName)}` : ""}
                      </span>
                    );
                  })}
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Vista diaria: limpiezas para el día de referencia con acciones inline.
 */
function DailyCleaningsView({
  cleanings,
  properties,
  referenceDate,
  searchParams,
  view,
  monthParamForLinks,
  dateParamForLinks,
}: {
  cleanings: CleaningWithProperty[];
  properties: Property[];
  referenceDate: Date;
  searchParams: { month?: string; view?: string; date?: string; confirm?: string; cleaningId?: string };
  view: string;
  monthParamForLinks: string;
  dateParamForLinks: string;
}) {
  const dayKey = `${referenceDate.getFullYear()}-${referenceDate.getMonth()}-${referenceDate.getDate()}`;

  const dayCleanings = cleanings
    .filter((c) => {
      const d = c.scheduledDate;
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      return key === dayKey;
    })
    // Ordenar: las que requieren atención primero
    .sort((a, b) => {
      // Alineado con getCleaningAttentionReasons(): asignada = no mostrar alerta
      const aEffective = (a as any).needsAttention && !(a as any).assignedMembershipId && a.status === "PENDING";
      const bEffective = (b as any).needsAttention && !(b as any).assignedMembershipId && b.status === "PENDING";
      const aNeedsAttention = aEffective ? 1 : 0;
      const bNeedsAttention = bEffective ? 1 : 0;
      if (aNeedsAttention !== bNeedsAttention) {
        return bNeedsAttention - aNeedsAttention; // Las que requieren atención primero
      }
      // Si ambas tienen o no tienen atención, ordenar por hora
      return a.scheduledDate.getTime() - b.scheduledDate.getTime();
    });

  const dayLabel = referenceDate.toLocaleString("es-MX", {
    weekday: "long",
    day: "2-digit",
    month: "short",
  });

  const isToday =
    referenceDate.toDateString() === new Date().toDateString();

  // Crear mapa de colores por propiedad
  const colorToHex: Record<string, string> = {
    "bg-emerald-500": "#10b981",
    "bg-sky-500": "#0ea5e9",
    "bg-amber-500": "#f59e0b",
    "bg-fuchsia-500": "#d946ef",
    "bg-rose-500": "#f43f5e",
    "bg-slate-500": "#64748b",
  };

  const propertyColorMap = new Map<string, string>();
  const propertyColorHexMap = new Map<string, string>();
  properties.forEach((p, index) => {
    const color = getPropertyColor(index);
    propertyColorMap.set(p.id, color);
    propertyColorHexMap.set(p.id, colorToHex[color] || "#64748b");
  });

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-3 sm:p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-neutral-600">
          {isToday ? "Hoy · " : ""}{dayLabel}
        </p>
        <p className="text-xs text-neutral-500">
          Vista diaria{isToday ? " (hoy)" : ""}
        </p>
      </div>

      {dayCleanings.length === 0 ? (
        <p className="text-base text-neutral-500">
          {isToday ? "Hoy no hay limpiezas programadas." : "No hay limpiezas programadas para este día."}
        </p>
      ) : (
        <ul className="space-y-3">
          {dayCleanings.map((c) => {
            // FASE 4: propertyId ahora apunta directamente a Property.id
            const propertyIdForColor = c.propertyId;
            const color = propertyColorMap.get(propertyIdForColor) ?? "bg-neutral-400";
            const colorHex = propertyColorHexMap.get(propertyIdForColor) ?? "#64748b";
            const ui = getCleaningUi(c.status, color);
            const confirm = searchParams.confirm === "cancel";
            const confirmId = searchParams.cleaningId === c.id;
            const isConfirmingCancel = confirm && confirmId;
            const canAct = c.status === "PENDING" || c.status === "IN_PROGRESS";

            const baseParams = new URLSearchParams();
            baseParams.set("view", searchParams.view || "month");
            if (dateParamForLinks) baseParams.set("date", dateParamForLinks);
            if (monthParamForLinks) baseParams.set("month", monthParamForLinks);

            const returnTo = `/host/cleanings?${baseParams.toString()}`;
            const detailsHref = `/host/cleanings/${c.id}?returnTo=${encodeURIComponent(returnTo)}`;

            const cancelConfirmHref = (() => {
              const p = new URLSearchParams(baseParams);
              p.set("confirm", "cancel");
              p.set("cleaningId", c.id);
              return `/host/cleanings?${p.toString()}`;
            })();

            const clearConfirmHref = `/host/cleanings?${baseParams.toString()}`;

            {/* Calcular variante de atención para la tarjeta diaria */}
            const dailyKind = hostKindFromCleaning({
              status: c.status,
              assignmentStatus: (c as any).assignmentStatus,
              assignedMembershipId: (c as any).assignedMembershipId,
              scheduledDate: c.scheduledDate,
            });
            const dailyIsAttention =
              dailyKind !== "overdue" &&
              c.status !== "IN_PROGRESS" && c.status !== "COMPLETED" &&
              (((c as any).needsAttention && !(c as any).assignedMembershipId) || dailyKind === "unassigned");
            const dailyRowExtra = dailyIsAttention ? " border-amber-300 bg-amber-50" : "";

            return (
              <li
                key={c.id}
                className={`${ui.rowClass}${dailyRowExtra}`}
                title={`${c.property.name} · ${formatStatus(c.status)}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={detailsHref}
                    className="min-w-0 flex-1 block rounded-lg -m-1 p-1 hover:bg-neutral-50 active:bg-neutral-100 transition"
                    aria-label={`Ver detalles de limpieza ${c.property.shortName || c.property.name}`}
                  >
                    <p className={`text-base flex items-center gap-1.5 ${c.status === "IN_PROGRESS" ? "font-bold text-neutral-900" : "font-semibold text-black"} ${ui.titleClass || ""}`}>
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: colorHex }}
                      />
                      {c.status === "IN_PROGRESS" && (
                        <span className="inline-flex w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                      )}
                      {dailyKind === "overdue" && (
                        <span className="inline-flex w-2 h-2 rounded-full bg-red-500 flex-shrink-0" title="Vencida" />
                      )}
                      {c.status === "COMPLETED" ? (
                        <span className="rounded px-2 py-0.5 bg-emerald-100 text-emerald-700 text-sm font-medium">
                          {c.property.shortName || c.property.name}
                        </span>
                      ) : (
                        c.property.shortName || c.property.name
                      )}
                      {dailyIsAttention && (
                        <span className="ml-1 text-amber-600" title="Requiere atención">
                          ⚠️
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-neutral-600 mt-1">
                      {formatDateOnly(new Date(c.scheduledDate))}
                      {ui.statusText && ` · ${ui.statusText}`}
                      {c.startedAt && (() => {
                        const duration = formatDuration(c.startedAt || null, c.completedAt || null);
                        return duration ? ` · ${duration}` : " · En progreso...";
                      })()}
                      {(c as any).assignedMember && (
                        <span className="text-neutral-500">
                          {" "}· Asignada a {(c as any).assignedMember.name}
                        </span>
                      )}
                      {(c as any).assignmentStatus === "OPEN" && !(c as any).assignedMember && (
                        <>
                          <span className="text-amber-600">
                            {" "}· Disponible
                          </span>
                          {(c as any).viewsCount > 0 && (
                            <span className="text-xs text-neutral-500 ml-1">
                              👁 {(c as any).viewsCount}
                            </span>
                          )}
                        </>
                      )}
                    </p>
                    {c.notes && (
                      <p className="text-xs text-neutral-500 mt-1 line-clamp-2">
                        {c.notes}
                      </p>
                    )}
                    {(c as any).reservationId && (
                      <p className="text-xs text-neutral-500 mt-1">
                        <Link
                          href={`/host/reservations/${(c as any).reservationId}`}
                          className="text-neutral-900 underline underline-offset-2 hover:text-neutral-700"
                        >
                          Ver reserva
                        </Link>
                      </p>
                    )}
                  </Link>
                </div>

                {/* Acciones */}
                <div className="mt-2">
                  {c.status === "PENDING" && !isConfirmingCancel && (
                    <div className="flex items-center gap-3">
                      <form action={startCleaning} className="flex-1">
                        <input type="hidden" name="cleaningId" value={c.id} />
                        <input type="hidden" name="view" value={view} />
                        <input type="hidden" name="date" value={dateParamForLinks} />
                        <input type="hidden" name="month" value={monthParamForLinks} />
                        <button
                          type="submit"
                          className="w-full rounded-lg bg-black px-3 py-2 text-base font-medium text-white hover:bg-neutral-800 active:scale-[0.99] transition"
                        >
                          ▶ Iniciar Limpieza
                        </button>
                      </form>

                      <Link
                        href={cancelConfirmHref}
                        className="text-xs text-neutral-500 underline underline-offset-2"
                      >
                        ⨯ Cancelar
                      </Link>
                    </div>
                  )}

                  {c.status === "IN_PROGRESS" && !isConfirmingCancel && (
                    <div className="flex items-center gap-3">
                      <form action={completeCleaning} className="flex-1">
                        <input type="hidden" name="cleaningId" value={c.id} />
                        <input type="hidden" name="view" value={view} />
                        <input type="hidden" name="date" value={dateParamForLinks} />
                        <input type="hidden" name="month" value={monthParamForLinks} />
                        <button
                          type="submit"
                          className="w-full rounded-lg bg-black px-3 py-2 text-base font-medium text-white hover:bg-neutral-800 active:scale-[0.99] transition"
                        >
                          ✔ Completar
                        </button>
                      </form>

                      <Link
                        href={cancelConfirmHref}
                        className="text-xs text-neutral-500 underline underline-offset-2"
                      >
                        ⨯ Cancelar
                      </Link>
                    </div>
                  )}

                  {canAct && isConfirmingCancel && (
                    <div className="flex items-center gap-3">
                      <form action={cancelCleaning} className="flex-1">
                        <input type="hidden" name="cleaningId" value={c.id} />
                        <input type="hidden" name="view" value={view} />
                        <input type="hidden" name="date" value={dateParamForLinks} />
                        <input type="hidden" name="month" value={monthParamForLinks} />
                        <button
                          type="submit"
                          className="w-full rounded-lg bg-black px-3 py-2 text-base font-medium text-white hover:bg-neutral-800 active:scale-[0.99] transition"
                        >
                          Confirmar cancelación
                        </button>
                      </form>

                      <BackChevron
                        href={clearConfirmHref}
                        size="sm"
                        className="text-xs"
                      />
                    </div>
                  )}

                  {c.status === "COMPLETED" && (
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-neutral-500">Completada</div>
                      <form action={reopenCleaning}>
                        <input type="hidden" name="cleaningId" value={c.id} />
                        <input type="hidden" name="view" value={view} />
                        <input type="hidden" name="date" value={dateParamForLinks} />
                        <input type="hidden" name="month" value={monthParamForLinks} />
                        <button
                          type="submit"
                          className="text-xs text-neutral-500 underline underline-offset-2"
                        >
                          Reabrir
                        </button>
                      </form>
                    </div>
                  )}

                  {c.status === "CANCELLED" && (
                    <div className="text-xs text-neutral-500">Cancelada</div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
