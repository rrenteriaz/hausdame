/**
 * Smoke tests — Modelo de limpiezas (contrato §3, §11, §8/§10)
 * Referencia: docs/contracts/cleaning-operating-model.md
 *
 * No conecta a DB. Solo verifica helpers puros.
 */

import { describe, it, expect } from "vitest";
import { assertAssignmentCoherence, assertValidScheduledDate } from "../assertCleaningInvariants";
import { assertCleaningIsNotFrozen, CleaningFrozenError } from "../assertCleaningIsNotFrozen";
import { buildCleaningScheduledDate } from "../../datetime/buildCleaningScheduledDate";

// ─────────────────────────────────────────────────────────────────────────────
// Test A — §3: assignedMembershipId != null → needsAttention debe ser false
// ─────────────────────────────────────────────────────────────────────────────
describe("assertAssignmentCoherence", () => {
  it("no lanza si assignedMembershipId es null y needsAttention es true (OPEN con atención)", () => {
    expect(() =>
      assertAssignmentCoherence(
        { assignedMembershipId: null, needsAttention: true, attentionReason: "NO_AVAILABLE_MEMBER" },
        "test"
      )
    ).not.toThrow();
  });

  it("no lanza si assignedMembershipId está asignado y needsAttention es false (estado correcto)", () => {
    expect(() =>
      assertAssignmentCoherence(
        { assignedMembershipId: "membership-abc", needsAttention: false, attentionReason: null },
        "test"
      )
    ).not.toThrow();
  });

  it("lanza si assignedMembershipId != null pero needsAttention es true (estado incoherente)", () => {
    expect(() =>
      assertAssignmentCoherence(
        { assignedMembershipId: "membership-abc", needsAttention: true, attentionReason: "NO_AVAILABLE_MEMBER" },
        "test"
      )
    ).toThrow(/Invariant violated.*assignedMembershipId is set but needsAttention=true/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test B — §11: IN_PROGRESS → no se puede cambiar teamId ni assignedMembershipId
// ─────────────────────────────────────────────────────────────────────────────
describe("assertCleaningIsNotFrozen", () => {
  it("no lanza si status es PENDING", () => {
    expect(() => assertCleaningIsNotFrozen("cleaning-1", "PENDING")).not.toThrow();
  });

  it("no lanza si status es CANCELLED", () => {
    expect(() => assertCleaningIsNotFrozen("cleaning-1", "CANCELLED")).not.toThrow();
  });

  it("lanza CleaningFrozenError si status es IN_PROGRESS", () => {
    expect(() => assertCleaningIsNotFrozen("cleaning-1", "IN_PROGRESS")).toThrow(CleaningFrozenError);
  });

  it("lanza CleaningFrozenError si status es COMPLETED", () => {
    expect(() => assertCleaningIsNotFrozen("cleaning-1", "COMPLETED")).toThrow(CleaningFrozenError);
  });

  it("el error incluye el cleaningId y el status", () => {
    expect(() => assertCleaningIsNotFrozen("cleaning-xyz", "IN_PROGRESS")).toThrow(
      /cleaning-xyz.*IN_PROGRESS/
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test C — §8/§10: buildCleaningScheduledDate construye 11:00 CDMX como 17:00 UTC
// ─────────────────────────────────────────────────────────────────────────────
describe("buildCleaningScheduledDate", () => {
  it("construye 11:00 CDMX (UTC-6) como 17:00 UTC para fecha 2026-04-19", () => {
    const date = buildCleaningScheduledDate(2026, 3, 19, 11, 0); // mes 3 = abril (0-indexed)
    expect(date.toISOString()).toBe("2026-04-19T17:00:00.000Z");
  });

  it("construye 10:00 CDMX como 16:00 UTC (checkout temprano)", () => {
    const date = buildCleaningScheduledDate(2026, 3, 19, 10, 0);
    expect(date.toISOString()).toBe("2026-04-19T16:00:00.000Z");
  });

  it("construye 12:30 CDMX como 18:30 UTC (checkout tardío con minutos)", () => {
    const date = buildCleaningScheduledDate(2026, 3, 19, 12, 30);
    expect(date.toISOString()).toBe("2026-04-19T18:30:00.000Z");
  });

  it("produce un Date válido (no NaN)", () => {
    const date = buildCleaningScheduledDate(2026, 3, 19, 11, 0);
    expect(isNaN(date.getTime())).toBe(false);
  });

  it("assertValidScheduledDate no lanza con el resultado de buildCleaningScheduledDate", () => {
    const date = buildCleaningScheduledDate(2026, 3, 19, 11, 0);
    expect(() => assertValidScheduledDate(date, "test")).not.toThrow();
  });

  it("assertValidScheduledDate lanza con NaN Date", () => {
    expect(() => assertValidScheduledDate(new Date("invalid"), "test")).toThrow(
      /Invariant violated.*scheduledDate is not a valid Date/
    );
  });
});
