/**
 * Formatea un campo @db.Date (que Prisma devuelve como UTC midnight) para mostrar
 * solo la fecha en CDMX, sin hora. Usa timeZone: "UTC" para que UTC midnight
 * no se convierta a la noche anterior en CDMX.
 *
 * Ejemplo: new Date("2026-04-22T00:00:00Z") → "22 abr 2026"
 */
export function formatDateOnly(date: Date): string {
  return date.toLocaleDateString("es-MX", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Variante sin año — para listas donde el año está implícito.
 * Ejemplo: new Date("2026-04-22T00:00:00Z") → "22 abr"
 */
export function formatDateOnlyShort(date: Date): string {
  return date.toLocaleDateString("es-MX", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
  });
}
