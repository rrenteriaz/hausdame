import { ALLOW_PAST_OPEN_CLEANINGS } from "@/lib/flags";

/**
 * Regla de negocio: ventana de días hacia atrás para reclamar limpiezas OPEN.
 */
export const PAST_CLEANINGS_CLAIM_WINDOW_DAYS = 30;

/**
 * Devuelve la fecha UTC midnight del día UTC en que cae `now`.
 * scheduledDate es @db.Date → Prisma lo almacena/lee como UTC midnight.
 * Usar getUTC* garantiza el mismo resultado independientemente del TZ del runtime.
 */
function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function getAvailabilityStartDate(
  now: Date = new Date(),
  options?: { includePastOpen?: boolean }
): Date {
  // Comportamiento de legado o si se solicita explícitamente incluir pasadas.
  // Date.UTC acepta días negativos y desbordamientos de mes: JS los ajusta automáticamente.
  if (options?.includePastOpen || ALLOW_PAST_OPEN_CLEANINGS) {
    return new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - PAST_CLEANINGS_CLAIM_WINDOW_DAYS,
    ));
  }
  return startOfDayUTC(now);
}

export function getAvailabilityWindow(
  now: Date = new Date(),
  options?: { includePastOpen?: boolean }
) {
  const start = getAvailabilityStartDate(now, options);
  // +90 días: Date.UTC ajusta automáticamente cruces de mes/año.
  const end = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 90,
    23, 59, 59, 999,
  ));
  return { start, end };
}
