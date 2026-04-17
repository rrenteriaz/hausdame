/**
 * Construcción canónica de scheduledDate para limpiezas.
 *
 * Timezone operativa: America/Mexico_City = UTC-6 permanente.
 * México abolió el horario de verano (DST) en octubre 2023. CDMX es UTC-6 fijo.
 *
 * REGLA: si el usuario configura checkout = 11:00 para el 19 de abril,
 * la DB debe guardar 2026-04-19T17:00:00.000Z (= 11:00 CDMX en UTC).
 *
 * NO depende del timezone del servidor (Vercel = UTC).
 * NO depende del timezone del navegador.
 * NO usa new Date(y, m, d, h, min) ni setHours() — ambos usan el runtime local.
 */

/** UTC offset fijo de la timezone operativa del sistema. */
const OPERATIONAL_TZ_OFFSET = "-06:00" as const; // America/Mexico_City, UTC-6, sin DST

/**
 * Construye un `Date` UTC correcto a partir de un día calendario + hora local,
 * interpretando la hora en la timezone operativa (America/Mexico_City = UTC-6).
 *
 * Ejemplo:
 *   buildCleaningScheduledDate(2026, 3, 19, 11, 0)
 *   → new Date("2026-04-19T11:00:00-06:00")
 *   → 2026-04-19T17:00:00.000Z  ✅
 *
 * @param year     Año del día calendario (e.g. 2026)
 * @param month    Mes 0-indexed (e.g. 3 = abril, igual que en `new Date`)
 * @param day      Día del mes (e.g. 19)
 * @param hours    Hora en la timezone operativa (0-23, e.g. 11)
 * @param minutes  Minutos (0-59, e.g. 0)
 */
export function buildCleaningScheduledDate(
  year: number,
  month: number, // 0-indexed, igual que new Date(y, m, ...)
  day: number,
  hours: number,
  minutes: number
): Date {
  // ISO 8601 con offset explícito. JS lo parsea siempre en UTC.
  // Ejemplo: "2026-04-19T11:00:00-06:00" → 2026-04-19T17:00:00.000Z
  const iso = `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00${OPERATIONAL_TZ_OFFSET}`;
  return new Date(iso);
}
