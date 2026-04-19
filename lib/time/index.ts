/**
 * lib/time/index.ts
 *
 * Módulo central de tiempo para Hausdame.
 *
 * Importa siempre desde aquí en código nuevo. No importes directamente
 * desde lib/datetime/* en código nuevo — ese directorio se mantiene por
 * compatibilidad con imports existentes pero lib/time/ es el punto oficial.
 *
 * CONVENIOS:
 *   - Instante exacto  → Date (siempre UTC internamente, timestamptz en BD)
 *   - Fecha calendario → Date a medianoche UTC (date en BD, @db.Date en Prisma)
 *   - Hora local       → string "HH:MM" (sin timezone implícita)
 *   - Timezone         → string IANA ("America/Mexico_City")
 *
 * NO USAR:
 *   - new Date("YYYY-MM-DD") → ambiguo (puede ser UTC o local según runtime)
 *   - Date.parse("YYYY-MM-DD") → mismo problema
 *   - setHours() / setDate()  → usan TZ del proceso Node
 *   - toLocaleString() sin timeZone explícita → muestra hora UTC en Railway
 */

// ── Helpers de día actual en CDMX ────────────────────────────────────────────
export {
  getCdmxDate,
  getStartOfCdmxToday,
  getEndOfCdmxToday,
  getStartOfCdmxTomorrow,
  getEndOfCdmxNext7Days,
  getStartOfCdmxDay,
} from "@/lib/datetime/cdmxToday";

// ── Constructor seguro de scheduledDate para limpiezas ───────────────────────
export { buildCleaningScheduledDate } from "@/lib/datetime/buildCleaningScheduledDate";

// ── Formateo para display — SIEMPRE con timeZone explícita ───────────────────
export {
  CDMX_TZ,
  formatDateTimeLong,
  formatTime,
  formatDateShort,
  formatDateTimeCompact,
  formatScheduledForDetail,
} from "./display";
