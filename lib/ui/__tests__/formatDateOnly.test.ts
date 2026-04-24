/**
 * Tests para formatDateOnly y formatDateOnlyShort — helpers de display para campos @db.Date
 *
 * Referencia: docs/date-only-policy.md
 *
 * Garantías:
 *  1. Nunca muestra hora (ni "06:00 p.m." ni nada similar)
 *  2. UTC midnight se muestra como el día CORRECTO, no el día anterior
 *  3. No depende del TZ del proceso (timeZone: "UTC" explícito)
 */

import { describe, it, expect } from "vitest";
import { formatDateOnly, formatDateOnlyShort } from "../formatDateOnly";

// Campo @db.Date llega de Prisma como UTC midnight
const APR_22 = new Date("2026-04-22T00:00:00.000Z");
const DEC_31 = new Date("2025-12-31T00:00:00.000Z");
const JAN_01 = new Date("2026-01-01T00:00:00.000Z");

describe("formatDateOnly", () => {
  it("devuelve el día correcto para UTC midnight", () => {
    const result = formatDateOnly(APR_22);
    // Debe contener "22" y "abr" — no "21" (que sería el día anterior en TZ local -6)
    expect(result).toContain("22");
    expect(result).toMatch(/abr/i);
    expect(result).toContain("2026");
  });

  it("NO muestra el día anterior (bug original: UTC midnight → 6 PM del día anterior en CDMX)", () => {
    const result = formatDateOnly(APR_22);
    // En el bug original con TZ local, APR_22 UTC midnight → "21 abr" en CDMX
    expect(result).not.toMatch(/\b21\b/);
  });

  it("NO contiene hora, minutos ni 'p.m.'/'a.m.'", () => {
    const result = formatDateOnly(APR_22);
    expect(result).not.toMatch(/\d{1,2}:\d{2}/); // sin HH:mm
    expect(result).not.toMatch(/p\.m\.|a\.m\.|PM|AM/i);
  });

  it("maneja cambio de año correctamente: 31 dic 2025 → '31 dic 2025', no '01 ene 2026'", () => {
    const result = formatDateOnly(DEC_31);
    expect(result).toContain("31");
    expect(result).toMatch(/dic/i);
    expect(result).toContain("2025");
    expect(result).not.toMatch(/ene/i);
  });

  it("maneja 1 ene 2026 sin saltar al año anterior", () => {
    const result = formatDateOnly(JAN_01);
    expect(result).toMatch(/\b0?1\b/); // "01" o "1"
    expect(result).toMatch(/ene/i);
    expect(result).toContain("2026");
    expect(result).not.toContain("2025");
  });

  it("resultado es string no vacío", () => {
    const result = formatDateOnly(APR_22);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("formatDateOnlyShort", () => {
  it("devuelve el día correcto sin año", () => {
    const result = formatDateOnlyShort(APR_22);
    expect(result).toContain("22");
    expect(result).toMatch(/abr/i);
  });

  it("NO contiene el año", () => {
    const result = formatDateOnlyShort(APR_22);
    expect(result).not.toContain("2026");
  });

  it("NO muestra hora", () => {
    const result = formatDateOnlyShort(APR_22);
    expect(result).not.toMatch(/\d{1,2}:\d{2}/);
    expect(result).not.toMatch(/p\.m\.|a\.m\./i);
  });

  it("no muestra el día anterior (mismo bug que formatDateOnly)", () => {
    const result = formatDateOnlyShort(APR_22);
    expect(result).not.toMatch(/\b21\b/);
  });

  it("cambio de mes: 31 dic → '31 dic', no '01 ene'", () => {
    const result = formatDateOnlyShort(DEC_31);
    expect(result).toContain("31");
    expect(result).toMatch(/dic/i);
  });
});

describe("formatDateOnly — borde UTC a medianoche", () => {
  // Un segundo antes de midnight UTC: aún es el día anterior en UTC
  const APR_21_LAST_SECOND = new Date("2026-04-21T23:59:59.999Z");
  // Un segundo después de midnight UTC: ya es APR 22
  const APR_22_FIRST_SECOND = new Date("2026-04-22T00:00:01.000Z");

  it("23:59:59 UTC del día anterior → muestra '21 abr'", () => {
    const result = formatDateOnly(APR_21_LAST_SECOND);
    expect(result).toContain("21");
    expect(result).toMatch(/abr/i);
  });

  it("00:00:01 UTC del día → muestra '22 abr'", () => {
    const result = formatDateOnly(APR_22_FIRST_SECOND);
    expect(result).toContain("22");
    expect(result).toMatch(/abr/i);
  });
});
