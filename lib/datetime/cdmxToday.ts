/**
 * Helpers de fecha para la timezone operativa: America/Mexico_City = UTC-6, sin DST.
 * México abolió el horario de verano en octubre 2023. CDMX es UTC-6 permanente.
 *
 * El servidor Railway corre en UTC. Estos helpers corrigen la diferencia de 6h
 * para que "hoy" y "mañana" reflejen el día calendario del usuario en CDMX.
 */

const CDMX_OFFSET_MS = 6 * 3_600_000; // UTC-6 → restar 6h al timestamp UTC

/**
 * Devuelve el día calendario actual en CDMX: { year, month (0-indexed), day }.
 */
export function getCdmxDate(): { year: number; month: number; day: number } {
  const d = new Date(Date.now() - CDMX_OFFSET_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() };
}

/**
 * Inicio de hoy en CDMX, expresado como UTC.
 * CDMX 00:00 = UTC 06:00 del mismo día CDMX.
 */
export function getStartOfCdmxToday(): Date {
  const { year, month, day } = getCdmxDate();
  return new Date(Date.UTC(year, month, day, 6, 0, 0, 0));
}

/**
 * Fin de hoy en CDMX, expresado como UTC.
 * CDMX 23:59:59.999 = UTC 05:59:59.999 del día siguiente.
 */
export function getEndOfCdmxToday(): Date {
  const { year, month, day } = getCdmxDate();
  return new Date(Date.UTC(year, month, day + 1, 5, 59, 59, 999));
}

/**
 * Inicio de mañana en CDMX, expresado como UTC.
 */
export function getStartOfCdmxTomorrow(): Date {
  const { year, month, day } = getCdmxDate();
  return new Date(Date.UTC(year, month, day + 1, 6, 0, 0, 0));
}

/**
 * Fin del día +7 desde hoy en CDMX, expresado como UTC.
 */
export function getEndOfCdmxNext7Days(): Date {
  const { year, month, day } = getCdmxDate();
  return new Date(Date.UTC(year, month, day + 8, 5, 59, 59, 999));
}
