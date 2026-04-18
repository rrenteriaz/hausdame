/**
 * Grid visual del timeline de reservas — ventana de 3 meses.
 * Server Component — sin estado cliente.
 *
 * Layout:
 *   Cabecera fila 1:  [sticky: Propiedad] | [← mes A →] | [← mes B →] | [← mes C →]
 *   Cabecera fila 2:  [sticky: vacío    ] | D1 D2...Dn  | D1 D2...Dn  | D1 D2...Dn
 *   Fila propiedad:   [sticky: nombre   ] | barras absolutas sobre área de días
 */

import Link from "next/link";
import type { MonthSpec } from "./timelineUtils";
import {
  DAY_W,
  ROW_H,
  PROP_COL_W,
  calcBarLayoutInWindow,
  getDayOfWeekInitial,
  isWeekend,
  isCurrentDay,
} from "./timelineUtils";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

interface Property {
  id: string;
  name: string;
  shortName: string | null;
}

interface Cleaning {
  id: string;
  status: string;
  needsAttention: boolean;
  assignedMembershipId: string | null;
}

interface Reservation {
  id: string;
  propertyId: string;
  startDate: Date;
  endDate: Date;
  status: string;
  cleanings: Cleaning[];
}

interface Props {
  properties: Property[];
  reservations: Reservation[];
  months: MonthSpec[];
  windowStart: Date;
  windowEnd: Date;
  totalDays: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lane system — detecta solapamientos y asigna carril vertical
// ─────────────────────────────────────────────────────────────────────────────

/** Día UTC como número (YYYYMMDD) para comparación tolerante al formato T00:00Z vs T06:00Z */
function utcDay(d: Date): number {
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

function computeLanes(reservations: Reservation[]): Map<string, number> {
  const lanes = new Map<string, number>();
  const sorted = [...reservations].sort(
    (a, b) => a.startDate.getTime() - b.startDate.getTime()
  );

  for (const res of sorted) {
    let lane = 0;
    // Buscar el primer carril sin colisión (máx 3 carriles)
    // Comparar por día UTC para tolerar T00:00Z vs T06:00Z (datos históricos)
    while (lane < 3) {
      const laneOccupants = sorted.filter(
        (r) => (lanes.get(r.id) ?? -1) === lane && r.id !== res.id
      );
      const conflict = laneOccupants.some(
        (r) => utcDay(r.startDate) < utcDay(res.endDate) && utcDay(r.endDate) > utcDay(res.startDate)
      );
      if (!conflict) break;
      lane++;
    }
    lanes.set(res.id, lane);
  }
  return lanes;
}

// ─────────────────────────────────────────────────────────────────────────────
// Geometría de barras — altura uniforme para todos los carriles
// ─────────────────────────────────────────────────────────────────────────────

const BAR_H = Math.floor(ROW_H * 0.5); // 50% del espacio disponible → 26px
const BAR_GAP = 4;

// Ancho de la columna de propiedades: reducido en móvil para mostrar ≥8 días
// 96px en móvil → ~390-96=294px para días → ≥9 días de 32px visibles
const PROP_COL_W_MOBILE = 96;

// Extensión visual de la barra hacia el día de checkout (11am / 24h * DAY_W)
const CHECKOUT_OVERLAP_PX = Math.round(DAY_W * 11 / 24); // ≈ 15px

function barGeometry(_maxLane: number, _lane: number): { top: number; height: number } {
  // Todas las barras centradas en ROW_H — solapamientos son imposibles en el negocio,
  // así que todas las filas tienen altura uniforme y las barras siempre quedan centradas.
  return { top: Math.floor((ROW_H - BAR_H) / 2), height: BAR_H };
}

function rowHeight(_maxLane: number): number {
  return ROW_H;
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente
// ─────────────────────────────────────────────────────────────────────────────

export default function ReservationsTimelineGrid({
  properties,
  reservations,
  months,
  windowStart,
  windowEnd,
  totalDays,
}: Props) {
  const gridW = totalDays * DAY_W;

  // Agrupar reservas por propiedad
  const byProperty = new Map<string, Reservation[]>();
  for (const r of reservations) {
    if (!byProperty.has(r.propertyId)) byProperty.set(r.propertyId, []);
    byProperty.get(r.propertyId)!.push(r);
  }

  // Offset acumulado de columnas de día para cada mes
  // months[0] empieza en offset 0, months[1] en offset months[0].daysInMonth, etc.
  const monthOffsets = months.reduce<number[]>((acc, _, i) => {
    acc.push(i === 0 ? 0 : acc[i - 1] + months[i - 1].daysInMonth);
    return acc;
  }, []);

  return (
    // El div exterior NO tiene overflow; lo maneja TimelineScrollContainer
    <div style={{ minWidth: PROP_COL_W_MOBILE + gridW }}>
      <style>{`
        .tl-prop-col { width: ${PROP_COL_W_MOBILE}px; flex-shrink: 0; }
        @media (min-width: 640px) { .tl-prop-col { width: ${PROP_COL_W}px; } }
      `}</style>

      {/* ── Cabeceras (sticky top — permanecen visibles al hacer scroll vertical) */}
      <div className="sticky top-0 z-20 bg-white">

      {/* ── Cabecera fila 1: etiquetas de mes ─────────────────────────── */}
      <div className="flex border-b border-neutral-200">
        {/* Celda esquina */}
        <div
          className="tl-prop-col sticky left-0 z-30 bg-white border-r border-neutral-200 px-3 sm:px-4 flex items-end pb-2"
        >
          <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider">
            Propiedad
          </span>
        </div>

        {/* Etiquetas de mes — cada una ocupa sus días */}
        {months.map((m, mi) => (
          <div
            key={`${m.year}-${m.month}`}
            className={[
              "flex-none flex items-end px-3 pb-1.5",
              mi < months.length - 1 ? "border-r-2 border-neutral-200" : "",
              m.isFocused ? "bg-white" : "bg-neutral-50/60",
            ].join(" ")}
            style={{ width: m.daysInMonth * DAY_W }}
          >
            <span
              className={[
                "text-xs font-semibold tracking-tight",
                m.isFocused ? "text-neutral-800" : "text-neutral-400",
              ].join(" ")}
            >
              {m.label}
            </span>
          </div>
        ))}
      </div>

      {/* ── Cabecera fila 2: números de día + iniciales de semana ──────── */}
      <div className="flex border-b border-neutral-200">
        {/* Celda esquina (vacía) */}
        <div className="tl-prop-col sticky left-0 z-30 bg-white border-r border-neutral-200" />

        {/* Días de cada mes */}
        {months.map((m, mi) =>
          Array.from({ length: m.daysInMonth }, (_, di) => {
            const day = di + 1;
            const weekend = isWeekend(m.year, m.month, day);
            const today = isCurrentDay(m.year, m.month, day);
            const isLastDayOfMonth = day === m.daysInMonth && mi < months.length - 1;
            return (
              <div
                key={`${m.year}-${m.month}-${day}`}
                className={[
                  "flex-none flex flex-col items-center justify-center pt-1 pb-0.5",
                  isLastDayOfMonth
                    ? "border-r-2 border-neutral-200"
                    : "border-r border-neutral-100",
                  today
                    ? "bg-sky-50"
                    : weekend && !m.isFocused
                    ? "bg-neutral-50/40"
                    : weekend
                    ? "bg-neutral-50"
                    : "",
                ].join(" ")}
                style={{ width: DAY_W }}
              >
                {/* Inicial del día */}
                <span
                  className={[
                    "text-[9px] leading-none mb-0.5",
                    today
                      ? "text-sky-500 font-semibold"
                      : weekend
                      ? "text-neutral-400"
                      : "text-neutral-300",
                  ].join(" ")}
                >
                  {getDayOfWeekInitial(m.year, m.month, day)}
                </span>
                {/* Número de día */}
                <span
                  className={[
                    "text-xs leading-none font-medium",
                    today
                      ? "text-sky-600 font-bold"
                      : weekend
                      ? "text-neutral-500"
                      : "text-neutral-400",
                  ].join(" ")}
                >
                  {today ? (
                    <span className="relative">
                      {day}
                      <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-sky-400 block" />
                    </span>
                  ) : (
                    day
                  )}
                </span>
              </div>
            );
          })
        )}
      </div>

      </div>{/* fin sticky top */}

      {/* ── Filas de propiedades ──────────────────────────────────────── */}
      {properties.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-sm text-neutral-400">
          No hay propiedades registradas.
        </div>
      ) : (
        properties.map((prop, propIndex) => {
          const propReservations = byProperty.get(prop.id) ?? [];
          const isLastRow = propIndex === properties.length - 1;

          // Lane assignment para solapamientos
          const lanes = computeLanes(propReservations);
          const rawMaxLane =
            propReservations.length > 0
              ? Math.max(...propReservations.map((r) => lanes.get(r.id) ?? 0))
              : 0;
          // Limitar a 1 carril extra máximo para evitar filas desproporcionadas
          // cuando hay solapamientos históricos fuera del viewport actual
          const maxLane = Math.min(rawMaxLane, 1);
          const rh = rowHeight(maxLane);

          return (
            <div
              key={prop.id}
              className={["flex", isLastRow ? "" : "border-b border-neutral-100"].join(" ")}
            >
              {/* Nombre de propiedad (sticky) */}
              <div
                className="tl-prop-col sticky left-0 z-10 bg-white border-r border-neutral-200 px-3 sm:px-4 flex items-center"
                style={{ minHeight: rh }}
              >
                <span
                  className="text-sm text-neutral-800 truncate leading-tight"
                  title={prop.name}
                >
                  {prop.shortName || prop.name}
                </span>
              </div>

              {/* Área de días */}
              <div className="relative flex-none" style={{ width: gridW, height: rh }}>

                {/* Fondo: líneas de columna + resaltados por mes/fin de semana/hoy */}
                <div className="absolute inset-0 flex pointer-events-none">
                  {months.map((m, mi) =>
                    Array.from({ length: m.daysInMonth }, (_, di) => {
                      const day = di + 1;
                      const weekend = isWeekend(m.year, m.month, day);
                      const today = isCurrentDay(m.year, m.month, day);
                      const isLastDayOfMonth =
                        day === m.daysInMonth && mi < months.length - 1;
                      return (
                        <div
                          key={`bg-${m.year}-${m.month}-${day}`}
                          className={[
                            "h-full flex-none",
                            isLastDayOfMonth
                              ? "border-r-2 border-neutral-200"
                              : "border-r border-neutral-100",
                            today
                              ? "bg-sky-50/60"
                              : weekend && !m.isFocused
                              ? "bg-neutral-50/30"
                              : weekend
                              ? "bg-neutral-50/60"
                              : "",
                          ].join(" ")}
                          style={{ width: DAY_W }}
                        />
                      );
                    })
                  )}
                </div>

                {/* Barras de reserva */}
                {propReservations.map((res) => {
                  const layout = calcBarLayoutInWindow(
                    res.startDate,
                    res.endDate,
                    windowStart,
                    windowEnd
                  );
                  if (!layout) return null;

                  const lane = Math.min(lanes.get(res.id) ?? 0, maxLane);
                  const geo = barGeometry(maxLane, lane);

                  const isCancelled = res.status === "CANCELLED";
                  const hasAttention = res.cleanings.some(
                    (c) => c.needsAttention && !c.assignedMembershipId
                  );
                  const hasPendingCleaning = res.cleanings.some(
                    (c) =>
                      c.status === "PENDING" || c.status === "IN_PROGRESS"
                  );

                  // Extender la barra hacia el día de checkout (no aplica si ya sale de la ventana)
                  const checkoutExtension = layout.continuesInNext
                    ? 0
                    : Math.min(
                        CHECKOUT_OVERLAP_PX,
                        totalDays * DAY_W - (layout.leftPx + layout.widthPx)
                      );
                  const { nights } = layout;
                  const widthPx = layout.widthPx + checkoutExtension;
                  const isNarrow = widthPx < DAY_W * 2.5;
                  const isOneNight = nights === 1;
                  const label = isNarrow
                    ? `${nights}N`
                    : nights === 1
                    ? "1 noche"
                    : `${nights} noches`;

                  // Insets horizontales: sin margen en los bordes cortados por la ventana
                  const leftInset = layout.isContinuedFromPrev ? 0 : 2;
                  const rightInset = layout.continuesInNext ? 0 : 2;

                  // Border radius: plano donde la barra sale de la ventana
                  const roundLeft = layout.isContinuedFromPrev
                    ? "rounded-l-none"
                    : "rounded-l-full";
                  const roundRight = layout.continuesInNext
                    ? "rounded-r-none"
                    : "rounded-r-full";

                  return (
                    <Link
                      key={res.id}
                      href={`/host/reservations/${res.id}?returnTo=/host/reservations`}
                      className={[
                        "absolute flex items-center overflow-hidden",
                        roundLeft,
                        roundRight,
                        isCancelled
                          ? "bg-neutral-200 text-neutral-500 hover:bg-neutral-300"
                          : "bg-neutral-800 text-white hover:bg-neutral-700",
                        "transition-colors",
                      ].join(" ")}
                      style={{
                        left: layout.leftPx + leftInset,
                        width: widthPx - leftInset - rightInset,
                        top: geo.top,
                        height: geo.height,
                      }}
                      title={`${nights} noche${nights !== 1 ? "s" : ""}${isCancelled ? " · cancelada" : ""}`}
                    >
                      {/* Label de noches — fuente más pequeña en barras de 1 noche para dejar espacio al punto */}
                      <span className={`min-w-0 flex-1 text-center font-medium whitespace-nowrap overflow-hidden text-ellipsis leading-none ${isOneNight ? "text-[9px] px-1" : "text-xs px-1.5"}`}>
                        {label}
                      </span>

                      {/* Señales secundarias: siempre visibles en 1 noche, resto solo si hay espacio */}
                      {(isOneNight || !isNarrow) && (hasAttention || hasPendingCleaning) && (
                        <span className="flex-none flex items-center gap-0.5 pr-1.5 shrink-0">
                          {hasAttention && (
                            <span
                              className="block w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"
                              title="Atención requerida"
                            />
                          )}
                          {hasPendingCleaning && !hasAttention && (
                            <span
                              className="block w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"
                              title="Limpieza pendiente"
                            />
                          )}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
