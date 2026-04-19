/**
 * lib/time/display.ts
 *
 * Helpers oficiales para formatear fechas y horas en la UI.
 *
 * REGLA: SIEMPRE pasan `timeZone` explícita. Nunca dependen de la TZ del proceso Node.
 * Para la timezone operativa de CDMX (UTC-6, sin DST) usar CDMX_TZ o pasar como argumento.
 */

/** Timezone operativa del sistema. Cambiar aquí si Hausdame expande a otras zonas. */
export const CDMX_TZ = "America/Mexico_City" as const;

/** Opciones base para fechas largas en español (sin hora). */
const DATE_LONG_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: "long",
  day: "2-digit",
  month: "short",
  year: "numeric",
};

/** Opciones base para hora en español. */
const TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
};

/**
 * Formatea un instante como fecha y hora larga en la timezone dada.
 * Ejemplo: "domingo, 19 abr. 2026, 11:00"
 */
export function formatDateTimeLong(date: Date, timeZone: string = CDMX_TZ): string {
  return date.toLocaleString("es-MX", {
    timeZone,
    ...DATE_LONG_OPTIONS,
    ...TIME_OPTIONS,
  });
}

/**
 * Formatea un instante como solo hora en la timezone dada.
 * Ejemplo: "11:00"
 */
export function formatTime(date: Date, timeZone: string = CDMX_TZ): string {
  return date.toLocaleString("es-MX", {
    timeZone,
    ...TIME_OPTIONS,
  });
}

/**
 * Formatea un instante como fecha corta (sin hora, sin día de semana) en la timezone dada.
 * Ejemplo: "19 abr. 2026"
 */
export function formatDateShort(date: Date, timeZone: string = CDMX_TZ): string {
  return date.toLocaleString("es-MX", {
    timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Formatea un instante como fecha y hora compacta para tablas/listas.
 * Ejemplo: "19 abr. 2026, 11:00"
 */
export function formatDateTimeCompact(date: Date, timeZone: string = CDMX_TZ): string {
  return date.toLocaleString("es-MX", {
    timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...TIME_OPTIONS,
  });
}

/**
 * Texto de "Programada para: …" usado en motivos de atención.
 * Centraliza el formato exacto para consistencia.
 */
export function formatScheduledForDetail(date: Date, timeZone: string = CDMX_TZ): string {
  return `Programada para: ${formatDateTimeLong(date, timeZone)}`;
}
