/**
 * Helpers puros para el timeline de reservas.
 * Sin dependencias de React ni Prisma — solo lógica de fechas y cálculo de layout.
 */
import { getCdmxDate } from "@/lib/datetime/cdmxToday";

/** Ancho de cada columna de día en píxeles. */
export const DAY_W = 32;

/** Altura base de fila de propiedad (1 carril). */
export const ROW_H = 52;

/** Ancho de la columna fija de nombres de propiedad en píxeles. */
export const PROP_COL_W = 168;

// ─────────────────────────────────────────────────────────────────────────────
// Fechas
// ─────────────────────────────────────────────────────────────────────────────

/** Número de días en un mes. month es 1-indexed. */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Primer día del mes (UTC midnight). month es 1-indexed. */
export function getMonthStart(year: number, month: number): Date {
  return new Date(Date.UTC(year, month - 1, 1));
}

/** Primer día del MES SIGUIENTE (límite superior exclusivo). month es 1-indexed. */
export function getMonthEnd(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 1));
}

// ─────────────────────────────────────────────────────────────────────────────
// Navegación de mes
// ─────────────────────────────────────────────────────────────────────────────

export function prevMonth(year: number, month: number) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

export function nextMonth(year: number, month: number) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

/** Serializa año y mes a string "YYYY-MM" para URL param. */
export function monthParam(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * Parsea el param ?month=YYYY-MM.
 * Devuelve el mes actual UTC si el param es inválido o ausente.
 */
export function parseMonthParam(param: string | undefined | null): {
  year: number;
  month: number;
} {
  if (param && /^\d{4}-(0[1-9]|1[0-2])$/.test(param)) {
    const [y, m] = param.split("-").map(Number);
    if (y >= 2020 && y <= 2035) return { year: y, month: m };
  }
  const now = new Date();
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
}

/** Etiqueta legible del mes en español: "Abril 2026". */
export function formatMonthLabel(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month - 1, 1));
  const raw = d.toLocaleDateString("es-MX", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Ventana multi-mes
// ─────────────────────────────────────────────────────────────────────────────

export interface MonthSpec {
  year: number;
  month: number; // 1-indexed
  daysInMonth: number;
  monthStart: Date;
  label: string;
  isFocused: boolean;
}

export interface MonthWindow {
  months: MonthSpec[];
  windowStart: Date;
  windowEnd: Date;
  totalDays: number;
  /** Días desde windowStart hasta el inicio del mes enfocado.
   *  Multiplicar × DAY_W para obtener el scrollLeft inicial. */
  focusedMonthOffsetDays: number;
}

/**
 * Construye una ventana de N meses centrada en el mes enfocado.
 * Por defecto: 4 meses antes + mes actual + 8 meses después = 13 meses.
 * El grid renderiza todos los meses de corrido; el scroll inicial
 * posiciona el mes enfocado en el borde izquierdo visible.
 */
export function buildMonthWindow(
  focusedYear: number,
  focusedMonth: number,
  monthsBefore = 4,
  monthsAfter = 8,
): MonthWindow {
  // Encontrar el primer mes de la ventana retrocediendo monthsBefore pasos
  let cur = { year: focusedYear, month: focusedMonth };
  for (let i = 0; i < monthsBefore; i++) {
    cur = prevMonth(cur.year, cur.month);
  }

  // Construir todos los specs
  const specs: MonthSpec[] = [];
  for (let i = 0; i < monthsBefore + 1 + monthsAfter; i++) {
    specs.push({
      year: cur.year,
      month: cur.month,
      daysInMonth: getDaysInMonth(cur.year, cur.month),
      monthStart: getMonthStart(cur.year, cur.month),
      label: formatMonthLabel(cur.year, cur.month),
      isFocused: i === monthsBefore,
    });
    cur = nextMonth(cur.year, cur.month);
  }

  const focusedMonthOffsetDays = specs
    .slice(0, monthsBefore)
    .reduce((s, m) => s + m.daysInMonth, 0);

  const lastSpec = specs[specs.length - 1];

  return {
    months: specs,
    windowStart: specs[0].monthStart,
    windowEnd: getMonthEnd(lastSpec.year, lastSpec.month),
    totalDays: specs.reduce((s, m) => s + m.daysInMonth, 0),
    focusedMonthOffsetDays,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cálculo de posición visual de barras
// ─────────────────────────────────────────────────────────────────────────────

export interface BarLayout {
  /** Offset en px desde el inicio de la ventana de días. */
  leftPx: number;
  /** Ancho visible de la barra en px. */
  widthPx: number;
  /** Total de noches de la reserva. */
  nights: number;
  /** Noches visibles en la ventana. */
  visibleNights: number;
  /** Viene de antes del inicio de la ventana. */
  isContinuedFromPrev: boolean;
  /** Continúa después del fin de la ventana. */
  continuesInNext: boolean;
}

/**
 * Calcula el layout de una barra en la ventana multi-mes.
 *
 * Semántica:
 * - startDate = check-in (primera noche ocupada, incluida)
 * - endDate   = check-out (día de salida, EXCLUIDO — no se pinta)
 *
 * Retorna null si la reserva no solapa la ventana.
 */
export function calcBarLayoutInWindow(
  startDate: Date,
  endDate: Date,
  windowStart: Date,
  windowEnd: Date
): BarLayout | null {
  if (endDate <= windowStart || startDate >= windowEnd) return null;

  const MS_PER_DAY = 86_400_000;
  const nights = Math.round(
    (endDate.getTime() - startDate.getTime()) / MS_PER_DAY
  );

  const clippedStart = startDate < windowStart ? windowStart : startDate;
  const clippedEnd = endDate > windowEnd ? windowEnd : endDate;

  const startDay0 = Math.round(
    (clippedStart.getTime() - windowStart.getTime()) / MS_PER_DAY
  );
  const visibleNights = Math.round(
    (clippedEnd.getTime() - clippedStart.getTime()) / MS_PER_DAY
  );

  return {
    leftPx: startDay0 * DAY_W,
    // Mínimo ancho: DAY_W - 4 → reservas de 1 noche siempre visibles y clickeables
    widthPx: Math.max(visibleNights * DAY_W, DAY_W - 4),
    nights,
    visibleNights,
    isContinuedFromPrev: startDate < windowStart,
    continuesInNext: endDate > windowEnd,
  };
}

// Mantener calcBarLayout para compatibilidad con los tests existentes
export function calcBarLayout(
  startDate: Date,
  endDate: Date,
  monthStart: Date,
  monthEnd: Date
): BarLayout | null {
  return calcBarLayoutInWindow(startDate, endDate, monthStart, monthEnd);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de día
// ─────────────────────────────────────────────────────────────────────────────

/** Inicial del día de la semana: "D" "L" "M" "X" "J" "V" "S". */
export function getDayOfWeekInitial(
  year: number,
  month: number,
  day: number
): string {
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return ["D", "L", "M", "X", "J", "V", "S"][dow];
}

export function isWeekend(year: number, month: number, day: number): boolean {
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return dow === 0 || dow === 6;
}

export function isCurrentDay(year: number, month: number, day: number): boolean {
  // month is 1-indexed; getCdmxDate().month is 0-indexed
  const { year: cy, month: cm, day: cd } = getCdmxDate();
  return year === cy && month === cm + 1 && day === cd;
}
