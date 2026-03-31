/**
 * Helpers canónicos para formatear fechas de reservas iCal (all-day VALUE=DATE).
 *
 * Semántica canónica: los dates de reserva se almacenan como UTC midnight (T00:00:00Z).
 * Todo display DEBE usar timeZone: "UTC" para evitar que el offset del servidor
 * (México: UTC-6) corrompa la fecha mostrada.
 */

/**
 * Formato corto: "12 mar. 2026"
 */
export function formatReservationDate(date: Date): string {
  return date.toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Formato largo con día de semana: "jueves, 12 de marzo de 2026"
 */
export function formatReservationDateLong(date: Date): string {
  return date.toLocaleString("es-MX", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Rango de fechas: "12 mar. 2026 — 15 mar. 2026" (o fecha única si coinciden)
 */
export function formatReservationDateRange(start: Date, end: Date): string {
  const startStr = formatReservationDate(start);
  const endStr = formatReservationDate(end);
  if (startStr === endStr) return startStr;
  return `${startStr} — ${endStr}`;
}

/**
 * Clave de mes en es-MX usando UTC: "marzo de 2026"
 * Usar para agrupar reservas por mes.
 */
export function getReservationMonthKey(date: Date): string {
  return date.toLocaleDateString("es-MX", {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

/**
 * Inicio del día UTC para la fecha de hoy del servidor.
 * Usar como límite inferior/superior en filtros de reservas.
 */
export function startOfUTCDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

/**
 * Jan 1 00:00:00Z del año dado. Usar para filtros de año en reservas.
 */
export function startOfUTCYear(year: number): Date {
  return new Date(Date.UTC(year, 0, 1));
}
