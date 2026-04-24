/**
 * Compara un campo @db.Date (UTC midnight) contra el inicio del día CDMX.
 *
 * scheduledDate llega como 2026-04-22T00:00:00Z.
 * getStartOfCdmxToday() devuelve 2026-04-22T06:00:00Z.
 *
 * Una limpieza para HOY: 2026-04-22T00:00:00Z < 2026-04-22T06:00:00Z → true
 * → isPastDateOnly() devuelve true para hoy (aún no "pasó" en el sentido de dia calendario).
 *
 * IMPORTANTE: esta función considera "vencido" si la fecha del campo
 * es anterior al inicio del día CDMX actual. Por lo tanto:
 *   - Fecha de hoy (UTC midnight de hoy) → false (NOT past — es hoy)
 *   - Fecha de ayer o antes → true (past)
 *
 * Implementación: compara startOfDay del campo (= UTC midnight del campo, que ES el día)
 * contra startOfDay de hoy en UTC midnight.
 * Para @db.Date, UTC midnight del campo = el día mismo.
 * startOfCdmxToday en términos de fecha UTC = fecha de hoy UTC midnight.
 */
import { getCdmxDate } from "./cdmxToday";

/**
 * Devuelve true si la fecha del campo @db.Date es anterior a hoy en CDMX.
 * (ayer o antes → true; hoy o futuro → false)
 *
 * @param dateOnly  Valor de un campo Prisma @db.Date (UTC midnight)
 */
export function isPastDateOnly(dateOnly: Date): boolean {
  // UTC midnight de hoy en CDMX
  const { year, month, day } = getCdmxDate();
  const todayUTCMidnight = Date.UTC(year, month, day);

  // UTC midnight del campo (ya está en UTC midnight por ser @db.Date)
  const fieldUTCMidnight = Date.UTC(
    dateOnly.getUTCFullYear(),
    dateOnly.getUTCMonth(),
    dateOnly.getUTCDate(),
  );

  return fieldUTCMidnight < todayUTCMidnight;
}
