// lib/ui/CleaningsCalendar/CleanerMonthlyCalendar.tsx
"use client";
import Link from "next/link";
import { CalendarCleanerKind } from "@/lib/ui/cleaning-visual-state";

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
  monthDate: Date;
  buildMonthHref: (date: Date) => string;
  buildDayHref: (date: Date) => string;
}

// Chip por estado cleaner (4 categorías simplificadas)
function cleanerChipStyle(kind: CalendarCleanerKind, status: string): string {
  if (status === "COMPLETED")                     return "bg-emerald-100 text-emerald-700";
  if (kind === "my")                              return "bg-blue-300 text-blue-900";
  if (kind === "available" || kind === "open")    return "bg-amber-200 text-amber-900";
  // member, lost → no disponible
  return "bg-neutral-100 text-neutral-400";
}

const CHIP_LEGEND = [
  { chip: "bg-blue-300 text-blue-900",       label: "Mía" },
  { chip: "bg-amber-200 text-amber-900",     label: "Disponible" },
  { chip: "bg-neutral-100 text-neutral-400", label: "No disponible" },
  { chip: "bg-emerald-100 text-emerald-700", label: "Completada" },
] as const;

export default function CleanerMonthlyCalendar({
  myCleanings,
  memberCleanings = [],
  lostCleanings = [],
  availableCleanings,
  openPastCleanings = [],
  monthDate,
  buildMonthHref,
  buildDayHref,
}: CleanerMonthlyCalendarProps) {
  const today = new Date();
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();

  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  const startWeekday = monthStart.getDay();
  const daysInMonth = monthEnd.getDate();

  const prevMonthDate = new Date(year, month - 1, 1);
  const nextMonthDate = new Date(year, month + 1, 1);

  const rawMonth = monthStart.toLocaleString("es-MX", { month: "long" });
  const monthName = rawMonth.charAt(0).toUpperCase() + rawMonth.slice(1) + ` ${year}`;
  const weekdayLabels = ["D", "L", "M", "M", "J", "V", "S"];

  // Agrupar limpiezas por día con kind explícito
  type CalendarEntry = CleaningForCalendar & { __kind: CalendarCleanerKind };
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

  // Construir semanas
  const weeks: Array<Array<{ date: Date | null }>> = [];
  let currentWeek: Array<{ date: Date | null }> = [];
  for (let i = 0; i < startWeekday; i++) currentWeek.push({ date: null });
  for (let day = 1; day <= daysInMonth; day++) {
    currentWeek.push({ date: new Date(year, month, day) });
    if (currentWeek.length === 7) { weeks.push(currentWeek); currentWeek = []; }
  }
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) currentWeek.push({ date: null });
    weeks.push(currentWeek);
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-3 sm:p-4">
      {/* Header con navegación */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Link
            href={buildMonthHref(prevMonthDate)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-neutral-300 text-xs text-neutral-700 hover:bg-neutral-100"
          >
            ←
          </Link>
          <p className="text-base font-medium text-neutral-800">{monthName}</p>
          <Link
            href={buildMonthHref(nextMonthDate)}
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
            const date = cell.date;
            if (!date) {
              return <div key={`${wi}-${di}`} className="h-16 sm:h-20 rounded-xl border border-transparent bg-transparent" />;
            }

            const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
            const dayCleanings = cleaningsByDay.get(key) ?? [];
            const isToday =
              date.getFullYear() === today.getFullYear() &&
              date.getMonth() === today.getMonth() &&
              date.getDate() === today.getDate();

            const hasAvailable = dayCleanings.some(c => c.__kind === "available" || c.__kind === "open");
            const cellBorder = isToday
              ? "border-black"
              : hasAvailable
                ? "border-emerald-200"
                : "border-neutral-200";

            const MAX_CHIPS = 4;
            const visible = dayCleanings.slice(0, MAX_CHIPS);
            const overflow = dayCleanings.length - MAX_CHIPS;

            return (
              <Link key={`${wi}-${di}`} href={buildDayHref(date)} className="block focus:outline-none">
                <div
                  className={`h-16 sm:h-20 rounded-xl border ${cellBorder} bg-white p-1 flex flex-col gap-[2px] hover:border-neutral-400 transition`}
                >
                  {/* Número del día */}
                  <span className={`text-[10px] font-medium leading-none self-start ${isToday ? "bg-black text-white rounded-full w-4 h-4 flex items-center justify-center text-[9px]" : "text-neutral-700"}`}>
                    {date.getDate()}
                  </span>

                  {/* Chips de propiedades */}
                  <div className="flex-1 flex flex-col gap-[2px] overflow-hidden">
                    {visible.map((c) => {
                      const chip = cleanerChipStyle(c.__kind, c.status);
                      const name = c.property.shortName || c.property.name;
                      return (
                        <span
                          key={c.id}
                          className={`rounded px-1 py-0 text-[7px] sm:text-[9px] font-medium leading-tight truncate block ${chip}`}
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

      {/* Leyenda simplificada */}
      <div className="border-t border-neutral-100 pt-3 mt-1">
        <p className="text-[9px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">Leyenda</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1.5">
          {CHIP_LEGEND.map(({ chip, label }) => (
            <div key={label} className="flex items-center gap-1">
              <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${chip}`}>Abc</span>
              <span className="text-[9px] text-neutral-500">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
