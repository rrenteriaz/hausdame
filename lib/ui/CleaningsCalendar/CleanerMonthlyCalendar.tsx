// lib/ui/CleaningsCalendar/CleanerMonthlyCalendar.tsx
import Link from "next/link";
import { getCleaningUi } from "@/lib/cleaning-ui";

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
  const month = monthDate.getMonth(); // 0-11

  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  const startWeekday = monthStart.getDay(); // 0=dom
  const daysInMonth = monthEnd.getDate();

  // Mes anterior y siguiente
  const prevMonthDate = new Date(year, month - 1, 1);
  const nextMonthDate = new Date(year, month + 1, 1);

  const rawMonth = monthStart.toLocaleString("es-MX", {
    month: "long",
  });
  const monthName =
    rawMonth.charAt(0).toUpperCase() + rawMonth.slice(1) + ` ${year}`;

  const weekdayLabels = ["D", "L", "M", "M", "J", "V", "S"];

  // Colores fijos por propiedad (igual que Host)
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

  // Obtener todas las propiedades únicas de todas las limpiezas
  const allProperties = new Map<string, { id: string; name: string; shortName?: string | null }>();
  [...myCleanings, ...memberCleanings, ...lostCleanings, ...availableCleanings, ...openPastCleanings].forEach((c) => {
    if (!allProperties.has(c.property.id)) {
      allProperties.set(c.property.id, c.property);
    }
  });

  // Crear mapas de colores usando id como clave
  const propertyColorMap = new Map<string, string>();
  const propertyColorHexMap = new Map<string, string>();
  Array.from(allProperties.values()).forEach((p, index) => {
    const color = colorClasses[index % colorClasses.length];
    propertyColorMap.set(p.id, color);
    propertyColorHexMap.set(p.id, colorToHex[color] || "#64748b");
  });

  // Agrupar limpiezas por día (combinar mías y disponibles, eliminando duplicados)
  type CalendarEntry = CleaningForCalendar & { __kind: "my" | "member" | "available" | "lost" | "open" };
  const cleaningsByDay = new Map<string, CalendarEntry[]>();
  const seenCleaningIds = new Set<string>(); // Para evitar duplicados

  // Orden de prioridad: my > member > available > lost > open (si hubiera duplicados)
  const combined: CalendarEntry[] = [
    ...myCleanings.map((c) => ({ ...c, __kind: "my" as const })),
    ...memberCleanings.map((c) => ({ ...c, __kind: "member" as const })),
    ...availableCleanings.map((c) => ({ ...c, __kind: "available" as const })),
    ...lostCleanings.map((c) => ({ ...c, __kind: "lost" as const })),
    ...openPastCleanings.map((c) => ({ ...c, __kind: "open" as const })),
  ];

  combined.forEach((c) => {
    // Evitar duplicados: si ya vimos esta limpieza, saltarla
    if (seenCleaningIds.has(c.id)) {
      return;
    }
    seenCleaningIds.add(c.id);

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
            href={buildMonthHref(prevMonthDate)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-neutral-300 text-xs text-neutral-700 hover:bg-neutral-100"
          >
            ←
          </Link>
          <p className="text-base font-medium text-neutral-800">
            {monthName}
          </p>
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
        {weekdayLabels.map((label, index) => (
          <div key={`weekday-${index}`} className="py-1">
            {label}
          </div>
        ))}
      </div>

      {/* Celdas del calendario */}
      <div className="grid grid-cols-7 gap-1 text-[11px] sm:text-[16.5px] pb-3 sm:pb-4">
        {weeks.map((week, wi) =>
          week.map((cell, di) => {
            const date = cell.date;
            if (!date) {
              return (
                <div
                  key={`${wi}-${di}`}
                  className="h-16 sm:h-20 rounded-xl border border-transparent bg-transparent"
                />
              );
            }

            const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
            const dayCleanings = cleaningsByDay.get(key) ?? [];

            const isToday =
              date.getFullYear() === today.getFullYear() &&
              date.getMonth() === today.getMonth() &&
              date.getDate() === today.getDate();

            return (
              <Link
                key={`${wi}-${di}`}
                href={buildDayHref(date)}
                className="block focus:outline-none"
              >
                <div
                  className={`h-16 sm:h-20 rounded-xl border ${
                    isToday ? "border-black" : "border-neutral-200"
                  } bg-neutral-50 p-1 flex flex-col gap-1 hover:border-black/70 transition`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium text-neutral-700">
                      {date.getDate()}
                    </span>
                  </div>

                  <div className="flex-1 space-y-0 overflow-hidden">
                    {dayCleanings.slice(0, 3).map((c) => {
                      if (!c.property) return null;
                      
                      const propertyIdForColor = c.property.id;
                      const color =
                        propertyColorMap.get(propertyIdForColor) ?? "bg-neutral-400";
                      const colorHex = propertyColorHexMap.get(propertyIdForColor) ?? "#64748b";
                      const label = c.property.shortName || c.property.name;
                      const ui = getCleaningUi(c.status, color);
                      const isMember = c.__kind === "member";
                      const isAvailable = c.__kind === "available";
                      const isLost = c.__kind === "lost";
                      const isOpen = c.__kind === "open";

                      return (
                        <div
                          key={c.id}
                          className={`truncate rounded-full px-0.5 py-[1px] text-[7px] sm:text-[10.5px] leading-none flex items-center gap-0.5 ${
                            isLost ? "text-neutral-400 line-through" : isOpen ? "text-amber-700" : isAvailable ? "text-neutral-700" : "text-black"
                          }`}
                          title={`${label} · ${formatStatus(c.status)} · Sin asignar`}
                        >
                          <span
                            className="w-1.5 h-1.5 sm:w-[9px] sm:h-[9px] rounded-full flex-shrink-0"
                            style={
                              isMember
                                ? { backgroundColor: "transparent", border: `2px solid ${colorHex}` }
                                : isLost
                                ? { backgroundColor: "#9ca3af", opacity: 0.7 }
                                : isOpen
                                ? { backgroundColor: "#f59e0b", opacity: 0.6 }
                                : { backgroundColor: colorHex, opacity: isAvailable ? 0.35 : 1 }
                            }
                          />
                          {label}
                          {isMember && (
                            <span className="text-[6px] sm:text-[9px] text-neutral-500 ml-0.5">
                              EQUIPO
                            </span>
                          )}
                          {isLost && (
                            <span className="text-[6px] sm:text-[9px] text-neutral-400 ml-0.5">
                              PERDIDA
                            </span>
                          )}
                          {isOpen && (
                            <span className="text-[6px] sm:text-[9px] text-amber-600 ml-0.5">
                              S.A.
                            </span>
                          )}
                        </div>
                      );
                    }).filter(Boolean)}
                    {dayCleanings.length > 3 && (
                      <div className="text-[9px] sm:text-[13.5px] text-neutral-600">
                        +{dayCleanings.length - 3} más
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
