import { ALLOW_PAST_OPEN_CLEANINGS } from "@/lib/flags";

/**
 * Regla de negocio: ventana de días hacia atrás para reclamar limpiezas OPEN.
 */
export const PAST_CLEANINGS_CLAIM_WINDOW_DAYS = 30;

function startOfToday(d: Date) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(d: Date) {
  const copy = new Date(d);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

export function getAvailabilityStartDate(
  now: Date = new Date(),
  options?: { includePastOpen?: boolean }
): Date {
  // Comportamiento de legado o si se solicita explícitamente incluir pasadas
  if (options?.includePastOpen || ALLOW_PAST_OPEN_CLEANINGS) {
    const start = new Date(now);
    start.setDate(start.getDate() - PAST_CLEANINGS_CLAIM_WINDOW_DAYS);
    return startOfToday(start);
  }
  return startOfToday(now);
}

export function getAvailabilityWindow(
  now: Date = new Date(),
  options?: { includePastOpen?: boolean }
) {
  const start = getAvailabilityStartDate(now, options);
  const end = new Date(now);
  end.setDate(end.getDate() + 90);
  return { start, end: endOfDay(end) };
}

