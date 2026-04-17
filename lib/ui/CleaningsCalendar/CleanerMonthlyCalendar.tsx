// lib/ui/CleaningsCalendar/CleanerMonthlyCalendar.tsx
"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import {
  CalendarCleanerKind,
  CleanerKind,
  calendarKindToCleanerKind,
  getCleanerVisual,
} from "@/lib/ui/cleaning-visual-state";

type CleaningForCalendar = {
  id: string;
  scheduledDate: Date;
  property: {
    id: string;
    name: string;
    shortName?: string | null;
  };
  status: string;
};

interface CleanerMonthlyCalendarProps {
  myCleanings: CleaningForCalendar[];
  memberCleanings?: CleaningForCalendar[];
  lostCleanings?: CleaningForCalendar[];
  availableCleanings: CleaningForCalendar[];
  openPastCleanings?: CleaningForCalendar[];
  /**
   * Primer día del mes a mostrar.
   * El servidor lo crea como `new Date(y, m, 1)` (medianoche UTC en servidor).
   * Para extraer año/mes sin desfase de zona horaria se usan getUTC* aquí.
   */
  monthDate: Date;
  /**
   * Si el calendario está en la vista de un miembro específico,
   * su ID se incluye en todos los hrefs generados internamente.
   */
  memberIdParam?: string;
}

// ─── helpers de URL ─────────────────────────────────────────────────────────

function fmtMonth(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function fmtDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthHref(year: number, month: number, memberIdParam?: string): string {
  const p = new URLSearchParams();
  if (memberIdParam) p.set("memberId", memberIdParam);
  p.set("view", "month");
  p.set("month", fmtMonth(year, month));
  return `/cleaner?${p.toString()}`;
}

function dayHref(
  cellYear: number,
  cellMonth: number,
  cellDay: number,
  currentMonthYear: number,
  currentMonthMonth: number,
  memberIdParam?: string
): string {
  const p = new URLSearchParams();
  if (memberIdParam) p.set("memberId", memberIdParam);
  p.set("view", "day");
  p.set("date", fmtDate(cellYear, cellMonth, cellDay));
  p.set("month", fmtMonth(currentMonthYear, currentMonthMonth));
  return `/cleaner?${p.toString()}`;
}

// ─── tipos y helpers de chip ─────────────────────────────────────────────────

type CalendarEntry = CleaningForCalendar & { __kind: CalendarCleanerKind };

/**
 * Deriva el CleanerKind canónico a partir de los datos de la celda.
 * Prioridad: COMPLETED > IN_PROGRESS > MINE_OVERDUE > MINE_PENDING
 *            > AVAILABLE_OVERDUE > AVAILABLE > OTHER_MEMBER > LOST
 */
function deriveKind(c: CalendarEntry): CleanerKind {
  const isOverdue = new Date(c.scheduledDate) < new Date();
  return calendarKindToCleanerKind(c.__kind, c.status, isOverdue);
}

// ─── componente ──────────────────────────────────────────────────────────────

export default function CleanerMonthlyCalendar({
  myCleanings,
  memberCleanings = [],
  lostCleanings = [],
  availableCleanings,
  openPastCleanings = [],
  monthDate,
  memberIdParam,
}: CleanerMonthlyCalendarProps) {

  // today: null durante SSR (servidor UTC ≠ zona del usuario).
  // Se setea en el cliente vía useEffect para usar la hora local real del dispositivo.
  const [today, setToday] = useState<Date | null>(null);
  useEffect(() => {
    setToday(new Date());
  }, []);

  // monthDate llega serializado como medianoche UTC (creado en el servidor con
  // `new Date(y, m, 1)` donde el servidor corre en UTC).
  // Usamos getUTC* para obtener el año y mes correctos sin desfase de zona horaria.
  const year  = monthDate.getUTCFullYear();
  const month = monthDate.getUTCMonth();

  const daysInMonth  = new Date(year, month + 1, 0).getDate();
  const startWeekday = new Date(year, month, 1).getDay();

  // Meses anterior y siguiente para la navegación
  const prevYear  = month === 0 ? year - 1 : year;
  const prevMonth = month === 0 ? 11 : month - 1;
  const nextYear  = month === 11 ? year + 1 : year;
  const nextMonth = month === 11 ? 0 : month + 1;

  // Nombre del mes en español
  const monthName = (() => {
    const raw = new Date(year, month, 1).toLocaleString("es-MX", { month: "long" });
    return raw.charAt(0).toUpperCase() + raw.slice(1) + ` ${year}`;
  })();

  const weekdayLabels = ["D", "L", "M", "M", "J", "V", "S"];

  // ── Agrupar limpiezas por día ──────────────────────────────────────────────
  // scheduledDate viene de Prisma como UTC DateTime.
  // getFullYear/Month/Date sin prefijo UTC = hora local del navegador = correcto en cliente.
  // Durante SSR (servidor UTC) también es correcto porque servidor local = UTC.
  const cleaningsByDay = new Map<string, CalendarEntry[]>();
  const seenIds = new Set<string>();

  const combined: CalendarEntry[] = [
    ...myCleanings.map((c) => ({ ...c, __kind: "my" as const })),
    ...memberCleanings.map((c) => ({ ...c, __kind: "member" as const })),
    ...availableCleanings.map((c) => ({ ...c, __kind: "available" as const })),
    ...lostCleanings.map((c) => ({ ...c, __kind: "lost" as const })),
    ...openPastCleanings.map((c) => ({ ...c, __kind: "open" as const })),
  ];

  combined.forEach((c) => {
    if (seenIds.has(c.id)) return;
    seenIds.add(c.id);
    const d = c.scheduledDate;
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const list = cleaningsByDay.get(key) ?? [];
    list.push(c);
    cleaningsByDay.set(key, list);
  });

  // ── Construir semanas ──────────────────────────────────────────────────────
  const weeks: Array<Array<{ year: number; month: number; day: number } | null>> = [];
  let currentWeek: Array<{ year: number; month: number; day: number } | null> = [];
  for (let i = 0; i < startWeekday; i++) currentWeek.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    currentWeek.push({ year, month, day });
    if (currentWeek.length === 7) { weeks.push(currentWeek); currentWeek = []; }
  }
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) currentWeek.push(null);
    weeks.push(currentWeek);
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-3 sm:p-4">
      {/* Header con navegación */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Link
            href={monthHref(prevYear, prevMonth, memberIdParam)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-neutral-300 text-xs text-neutral-700 hover:bg-neutral-100"
          >
            ←
          </Link>
          <p className="text-base font-medium text-neutral-800">{monthName}</p>
          <Link
            href={monthHref(nextYear, nextMonth, memberIdParam)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-neutral-300 text-xs text-neutral-700 hover:bg-neutral-100"
          >
            →
          </Link>
        </div>
        <p className="text-xs text-neutral-500">Vista mensual</p>
      </div>

      {/* Cabeceras de días */}
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] sm:text-[16.5px] text-neutral-500 mb-1">
        {weekdayLabels.map((label, i) => (
          <div key={`wd-${i}`} className="py-1">{label}</div>
        ))}
      </div>

      {/* Celdas */}
      <div className="grid grid-cols-7 gap-1 text-[11px] sm:text-[16.5px] pb-3 sm:pb-4">
        {weeks.map((week, wi) =>
          week.map((cell, di) => {
            if (!cell) {
              return <div key={`${wi}-${di}`} className="h-16 sm:h-20 rounded-xl border border-transparent bg-transparent" />;
            }

            const { year: cy, month: cm, day: cd } = cell;
            const key = `${cy}-${cm}-${cd}`;
            const dayCleanings = cleaningsByDay.get(key) ?? [];

            // isToday: solo evalúa en cliente (today inicia en null durante SSR)
            const isToday =
              today !== null &&
              cy === today.getFullYear() &&
              cm === today.getMonth() &&
              cd === today.getDate();

            const hasAvailable = dayCleanings.some(c => c.__kind === "available" || c.__kind === "open");
            const cellBorder = isToday
              ? "border-black"
              : hasAvailable
                ? "border-amber-200"
                : "border-neutral-200";

            const MAX_CHIPS = 4;
            const visible = dayCleanings.slice(0, MAX_CHIPS);
            const overflow = dayCleanings.length - MAX_CHIPS;

            return (
              <Link
                key={`${wi}-${di}`}
                href={dayHref(cy, cm, cd, year, month, memberIdParam)}
                className="block focus:outline-none"
              >
                <div
                  className={`h-16 sm:h-20 rounded-xl border ${cellBorder} bg-white p-1 flex flex-col gap-[2px] hover:border-neutral-400 transition`}
                >
                  {/* Número del día */}
                  <span className={`text-[10px] font-medium leading-none self-start ${isToday ? "bg-black text-white rounded-full w-4 h-4 flex items-center justify-center text-[9px]" : "text-neutral-700"}`}>
                    {cd}
                  </span>

                  {/* Chips de propiedades — sistema visual canónico */}
                  <div className="flex-1 flex flex-col gap-[2px] overflow-hidden">
                    {visible.map((c) => {
                      const name = c.property.shortName || c.property.name;
                      const kind = deriveKind(c);
                      const visual = getCleanerVisual(kind);

                      // EN PROGRESO → punto verde + negrita
                      if (kind === "mine_inprogress") {
                        return (
                          <span
                            key={c.id}
                            className="rounded px-1 py-0 text-[7px] sm:text-[9px] leading-tight inline-flex items-center gap-[2px] self-start max-w-full"
                            title={name}
                          >
                            <span className="inline-flex h-[5px] w-[5px] rounded-full bg-green-500 shrink-0" />
                            <span className={`font-bold truncate ${visual.pillText}`}>{name}</span>
                          </span>
                        );
                      }

                      // MÍA VENCIDA → punto rojo + nombre neutro
                      if (kind === "mine_overdue") {
                        return (
                          <span
                            key={c.id}
                            className="rounded px-1 py-0 text-[7px] sm:text-[9px] leading-tight inline-flex items-center gap-[2px] self-start max-w-full"
                            title={name}
                          >
                            <span className="inline-flex h-[5px] w-[5px] rounded-full bg-red-500 shrink-0" />
                            <span className={`truncate ${visual.pillText}`}>{name}</span>
                          </span>
                        );
                      }

                      // MÍA PENDIENTE → texto plano sin fondo
                      if (kind === "mine_pending") {
                        return (
                          <span
                            key={c.id}
                            className="px-1 py-0 text-[7px] sm:text-[9px] font-medium leading-tight truncate self-start max-w-full text-neutral-900"
                            title={name}
                          >
                            {name}
                          </span>
                        );
                      }

                      // RESTO (available, completed, other_member, lost) → chip con pillBg/pillText
                      return (
                        <span
                          key={c.id}
                          className={`rounded px-1 py-0 text-[7px] sm:text-[9px] font-medium leading-tight truncate self-start max-w-full ${visual.pillBg} ${visual.pillText}`}
                          title={name}
                        >
                          {name}
                        </span>
                      );
                    })}
                    {overflow > 0 && (
                      <span className="text-[7px] text-neutral-400 leading-none pl-0.5">
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

      {/* Leyenda — refleja exactamente los estados renderizados */}
      <div className="border-t border-neutral-100 pt-3 mt-1">
        <p className="text-[9px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">Leyenda</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1.5">
          {/* mine_pending: texto plano */}
          <div className="flex items-center gap-1">
            <span className="rounded px-1.5 py-0.5 text-[9px] font-medium text-neutral-900">Abc</span>
            <span className="text-[9px] text-neutral-500">Mía</span>
          </div>
          {/* mine_inprogress: punto verde + negrita */}
          <div className="flex items-center gap-1">
            <span className="rounded px-1.5 py-0.5 text-[9px] leading-tight inline-flex items-center gap-[3px]">
              <span className="inline-flex h-[5px] w-[5px] rounded-full bg-green-500 shrink-0" />
              <span className="font-bold text-blue-900">Abc</span>
            </span>
            <span className="text-[9px] text-neutral-500">En progreso</span>
          </div>
          {/* mine_overdue: punto rojo */}
          <div className="flex items-center gap-1">
            <span className="rounded px-1.5 py-0.5 text-[9px] leading-tight inline-flex items-center gap-[3px]">
              <span className="inline-flex h-[5px] w-[5px] rounded-full bg-red-500 shrink-0" />
              <span className="text-neutral-700">Abc</span>
            </span>
            <span className="text-[9px] text-neutral-500">Mía · Vencida</span>
          </div>
          {/* available / available_overdue: chip ámbar */}
          <div className="flex items-center gap-1">
            <span className="rounded px-1.5 py-0.5 text-[9px] font-medium bg-amber-100 text-amber-900">Abc</span>
            <span className="text-[9px] text-neutral-500">Disponible</span>
          </div>
          {/* completed: chip verde claro */}
          <div className="flex items-center gap-1">
            <span className="rounded px-1.5 py-0.5 text-[9px] font-medium bg-emerald-50 text-emerald-700">Abc</span>
            <span className="text-[9px] text-neutral-500">Completada</span>
          </div>
          {/* other_member: gris */}
          <div className="flex items-center gap-1">
            <span className="rounded px-1.5 py-0.5 text-[9px] font-medium bg-neutral-100 text-neutral-500">Abc</span>
            <span className="text-[9px] text-neutral-500">Otro cleaner</span>
          </div>
        </div>
      </div>
    </div>
  );
}
