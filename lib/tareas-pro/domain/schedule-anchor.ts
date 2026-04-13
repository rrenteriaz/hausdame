/**
 * schedule-anchor.ts — Lógica de ancla temporal para Tareas Pro
 *
 * Determina si un template programado debe dispararse "hoy" según su
 * configuración de frecuencia + ancla (dayOfWeek / dayOfMonth / timezone).
 *
 * ── Convenciones ────────────────────────────────────────────────────────
 * dayOfWeek : 0=domingo, 1=lunes, …, 6=sábado  (igual que Date.getDay())
 * dayOfMonth: 1–31  (si el día no existe en el mes, se usa el último día disponible)
 * timezone  : IANA string (ej. "America/Mexico_City"); null → "UTC"
 *
 * ── Diseño de occurrenceKey (scheduleDate) ──────────────────────────────
 * DAILY   → "daily:2024-04-10"
 * WEEKLY  → "weekly:2024-W15"   (ISO 8601 week)
 * MONTHLY → "monthly:2024-04"
 *
 * Esto se combina en buildOccurrenceKey como:
 *   schedule:{templateId}:{propertyId}:{scheduleDate}
 *
 * ── Backward compatibility ───────────────────────────────────────────────
 * Templates con frequency=WEEKLY pero anchorDayOfWeek=null devuelven
 * { fires: false } — el scheduler los omite silenciosamente hasta que
 * el host complete la configuración.
 */

// ---- Tipos públicos ----

export type DateParts = {
  year: number;
  month: number;     // 1–12
  day: number;       // 1–31
  dayOfWeek: number; // 0=dom … 6=sáb
  isoDate: string;   // "2024-04-10"
  isoWeek: string;   // "2024-W15" (ISO 8601)
  isoMonth: string;  // "2024-04"
};

export type FireResult =
  | { fires: false }
  | { fires: true; scheduleDate: string; period: "daily" | "weekly" | "monthly" };

// ---- Helpers internos ----

const WEEKDAY_SHORT_TO_JS: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/**
 * Calcula el número de semana ISO 8601 para una fecha dada como partes locales.
 * ISO: semana empieza el lunes; semana 1 = semana que contiene el primer jueves del año.
 */
function computeISOWeek(year: number, month: number, day: number, dayOfWeek: number): string {
  // Creamos un Date en UTC para aritmética sin ambigüedad de offset
  const d = new Date(Date.UTC(year, month - 1, day));

  // ISO weekday: 1=lun … 7=dom
  const isoWeekday = dayOfWeek === 0 ? 7 : dayOfWeek;

  // Jueves de la misma semana ISO
  const thursday = new Date(d);
  thursday.setUTCDate(d.getUTCDate() + (4 - isoWeekday));

  const isoYear = thursday.getUTCFullYear();

  // Lunes de la semana 1 del año ISO: el lunes de la semana que contiene el 4 de enero
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4IsoWeekday = jan4.getUTCDay() === 0 ? 7 : jan4.getUTCDay();
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4IsoWeekday + 1);

  const daysDiff = (thursday.getTime() - week1Monday.getTime()) / 86400000;
  const week = Math.floor(daysDiff / 7) + 1;

  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

// ---- API pública ----

/**
 * Comprueba si una string es una IANA timezone válida.
 * Usa Intl.DateTimeFormat como validador canónico — sin dependencias externas.
 */
export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Determina si la configuración de schedule de un template está completa
 * (es decir, si el cron puede generar jobs sin datos faltantes).
 *
 * - DAILY     → siempre completo
 * - WEEKLY    → requiere anchorDayOfWeek
 * - MONTHLY   → requiere anchorDayOfMonth
 * - MANUAL / PER_CHECKOUT → no aplica (siempre "completo" para este check)
 */
export function isScheduleComplete(
  frequency: string,
  anchorDayOfWeek: number | null,
  anchorDayOfMonth: number | null,
): boolean {
  if (frequency === "WEEKLY") return anchorDayOfWeek !== null;
  if (frequency === "MONTHLY") return anchorDayOfMonth !== null;
  return true;
}

/**
 * Descompone "ahora" en partes de fecha dentro de la timezone indicada.
 * Usado tanto por el scheduler como por tests unitarios.
 */
export function getDatePartsInTz(timezone: string | null, now: Date = new Date()): DateParts {
  const tz = timezone ?? "UTC";

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";

  const year = parseInt(get("year"), 10);
  const month = parseInt(get("month"), 10);
  const day = parseInt(get("day"), 10);
  const dayOfWeek = WEEKDAY_SHORT_TO_JS[get("weekday")] ?? 0;

  const isoDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const isoMonth = `${year}-${String(month).padStart(2, "0")}`;
  const isoWeek = computeISOWeek(year, month, day, dayOfWeek);

  return { year, month, day, dayOfWeek, isoDate, isoWeek, isoMonth };
}

/**
 * Devuelve si el template debe generar un job "hoy" y cuál sería
 * el scheduleDate para construir el occurrenceKey.
 *
 * Templates con ancla faltante (WEEKLY sin anchorDayOfWeek, MONTHLY sin
 * anchorDayOfMonth) devuelven { fires: false } — configuración incompleta.
 */
export function shouldFireToday(params: {
  frequency: string;
  anchorDayOfWeek: number | null;
  anchorDayOfMonth: number | null;
  timezone: string | null;
  now?: Date;
}): FireResult {
  const d = getDatePartsInTz(params.timezone, params.now);

  switch (params.frequency) {
    case "DAILY":
      return { fires: true, scheduleDate: `daily:${d.isoDate}`, period: "daily" };

    case "WEEKLY": {
      if (params.anchorDayOfWeek === null) return { fires: false }; // configuración incompleta
      if (d.dayOfWeek !== params.anchorDayOfWeek) return { fires: false };
      return { fires: true, scheduleDate: `weekly:${d.isoWeek}`, period: "weekly" };
    }

    case "MONTHLY": {
      if (params.anchorDayOfMonth === null) return { fires: false }; // configuración incompleta
      // Si el día ancla no existe en este mes (ej. anchor=31 en abril), usar el último día disponible
      const lastDayOfMonth = new Date(d.year, d.month, 0).getDate();
      const effectiveDay = Math.min(params.anchorDayOfMonth, lastDayOfMonth);
      if (d.day !== effectiveDay) return { fires: false };
      return { fires: true, scheduleDate: `monthly:${d.isoMonth}`, period: "monthly" };
    }

    default:
      // MANUAL, PER_CHECKOUT — no se programan automáticamente
      return { fires: false };
  }
}

/**
 * Texto legible para el usuario que describe cuándo se generará el job.
 * Usado en la UI del editor de template.
 */
export function scheduleHumanDescription(
  frequency: string,
  anchorDayOfWeek: number | null,
  anchorDayOfMonth: number | null,
): string {
  const DAY_NAMES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

  switch (frequency) {
    case "DAILY":
      return "Todos los días";
    case "WEEKLY":
      if (anchorDayOfWeek === null) return "Semanal — configura el día de la semana";
      return `Cada ${DAY_NAMES[anchorDayOfWeek]}`;
    case "MONTHLY":
      if (anchorDayOfMonth === null) return "Mensual — configura el día del mes";
      return `El día ${anchorDayOfMonth} de cada mes`;
    case "PER_CHECKOUT":
      return "En cada limpieza";
    case "MANUAL":
      return "Solo al generarse manualmente";
    default:
      return frequency;
  }
}
