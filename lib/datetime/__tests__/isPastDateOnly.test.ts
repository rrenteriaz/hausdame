/**
 * Tests para isPastDateOnly — helper canónico para comparar campos @db.Date
 *
 * Referencia: docs/date-only-policy.md
 *
 * Premisas:
 *  - scheduledDate llega de Prisma como UTC midnight (2026-04-22T00:00:00.000Z)
 *  - CDMX = UTC-6, sin DST desde oct 2023
 *  - "vencida" = la fecha del campo es anterior al día calendario CDMX actual
 *  - HOY nunca es "vencida", AYER siempre lo es
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isPastDateOnly } from "../isPastDateOnly";

// Fecha fija de referencia para todos los tests: martes 22 abr 2026
// Midnight CDMX = 2026-04-22T06:00:00Z
// Midnight UTC  = 2026-04-22T00:00:00Z
const APR_22_UTC_MIDNIGHT = new Date("2026-04-22T00:00:00.000Z");
const APR_21_UTC_MIDNIGHT = new Date("2026-04-21T00:00:00.000Z");
const APR_23_UTC_MIDNIGHT = new Date("2026-04-23T00:00:00.000Z");

// Punto de referencia en el día: 11 AM CDMX = 17:00 UTC (interior del día, sin ambigüedad)
const NOW_MID_DAY_CDMX = new Date("2026-04-22T17:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW_MID_DAY_CDMX);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("isPastDateOnly — casos canónicos", () => {
  it("hoy (UTC midnight de hoy CDMX) → false (no vencida)", () => {
    expect(isPastDateOnly(APR_22_UTC_MIDNIGHT)).toBe(false);
  });

  it("ayer (UTC midnight de ayer CDMX) → true (vencida)", () => {
    expect(isPastDateOnly(APR_21_UTC_MIDNIGHT)).toBe(true);
  });

  it("mañana (UTC midnight de mañana CDMX) → false (no vencida)", () => {
    expect(isPastDateOnly(APR_23_UTC_MIDNIGHT)).toBe(false);
  });
});

describe("isPastDateOnly — borde UTC/CDMX: tarde-noche CDMX", () => {
  // 11:59 PM CDMX (22 abr) = 05:59 AM UTC (23 abr)
  // getCdmxDate() debe seguir devolviendo abr-22
  it("a las 11:59 PM CDMX, la limpieza de HOY sigue siendo false (no vencida)", () => {
    vi.setSystemTime(new Date("2026-04-23T05:59:00.000Z")); // 11:59 PM CDMX
    expect(isPastDateOnly(APR_22_UTC_MIDNIGHT)).toBe(false);
  });

  it("a las 11:59 PM CDMX, la limpieza de AYER sigue siendo true (vencida)", () => {
    vi.setSystemTime(new Date("2026-04-23T05:59:00.000Z"));
    expect(isPastDateOnly(APR_21_UTC_MIDNIGHT)).toBe(true);
  });

  // En el bug original: new Date() a las 6 PM CDMX ya es UTC midnight del día siguiente.
  // Comprar scheduledDate < now daba: apr22 00:00Z < apr23 00:00Z → TRUE → falso "vencida"
  it("a las 6:01 PM CDMX (00:01 UTC día siguiente), la limpieza de HOY NO es vencida", () => {
    // 6 PM CDMX = 00:00 UTC próximo día
    vi.setSystemTime(new Date("2026-04-23T00:01:00.000Z")); // 6:01 PM CDMX abr 22
    expect(isPastDateOnly(APR_22_UTC_MIDNIGHT)).toBe(false);
  });
});

describe("isPastDateOnly — borde medianoche CDMX", () => {
  // Justo al dar las 12:00 AM CDMX (= 06:00 UTC), cambia el día CDMX
  it("justo al inicio del día CDMX (06:00 UTC), ayer sigue siendo past", () => {
    vi.setSystemTime(new Date("2026-04-22T06:00:00.000Z")); // Midnight CDMX apr 22
    expect(isPastDateOnly(APR_21_UTC_MIDNIGHT)).toBe(true);
  });

  it("justo al inicio del día CDMX (06:00 UTC), HOY no es past", () => {
    vi.setSystemTime(new Date("2026-04-22T06:00:00.000Z")); // Midnight CDMX apr 22
    expect(isPastDateOnly(APR_22_UTC_MIDNIGHT)).toBe(false);
  });

  it("59 segundos antes de medianoche CDMX (05:59:01 UTC), HOY no es past", () => {
    vi.setSystemTime(new Date("2026-04-22T05:59:01.000Z")); // 23:59 CDMX apr 21
    // getCdmxDate() devuelve apr 21 aquí — así que APR_22 aún es "mañana"
    expect(isPastDateOnly(APR_22_UTC_MIDNIGHT)).toBe(false);
  });

  it("59 segundos antes de medianoche CDMX (23:59 CDMX abr 21): hoy CDMX ES abr 21 → abr 21 no es past", () => {
    // 05:59:01 UTC = 23:59:01 CDMX apr 21 → getCdmxDate() devuelve apr 21
    vi.setSystemTime(new Date("2026-04-22T05:59:01.000Z"));
    expect(isPastDateOnly(APR_21_UTC_MIDNIGHT)).toBe(false); // hoy en CDMX, no vencida
  });

  it("59 segundos antes de medianoche CDMX, el día anterior (abr 20) SÍ es past", () => {
    vi.setSystemTime(new Date("2026-04-22T05:59:01.000Z")); // 23:59 CDMX abr 21
    const APR_20 = new Date("2026-04-20T00:00:00.000Z");
    expect(isPastDateOnly(APR_20)).toBe(true); // ayer en CDMX
  });
});

describe("isPastDateOnly — semana completa de regresión", () => {
  // Simula el 22 de abril 2026, mediodía CDMX
  const cases = [
    { label: "7 días antes", date: new Date("2026-04-15T00:00:00.000Z"), expected: true },
    { label: "2 días antes", date: new Date("2026-04-20T00:00:00.000Z"), expected: true },
    { label: "ayer",         date: new Date("2026-04-21T00:00:00.000Z"), expected: true },
    { label: "hoy",          date: new Date("2026-04-22T00:00:00.000Z"), expected: false },
    { label: "mañana",       date: new Date("2026-04-23T00:00:00.000Z"), expected: false },
    { label: "7 días después", date: new Date("2026-04-29T00:00:00.000Z"), expected: false },
  ];

  cases.forEach(({ label, date, expected }) => {
    it(`${label} → ${expected ? "vencida" : "no vencida"}`, () => {
      expect(isPastDateOnly(date)).toBe(expected);
    });
  });
});
