/**
 * DIAGNÓSTICO SOLO-LECTURA: cleanings afectadas por bug de timezone.
 *
 * No modifica nada. Solo SELECT/query.
 *
 * Bug: antes del fix, la persistencia usaba setHours(h, m) en servidor UTC,
 * produciendo scheduledDate con UTC-hour = hora-local CDMX (debería ser hora-local + 6).
 *
 * Patrón "buggy": EXTRACT(HOUR FROM scheduledDate AT TIME ZONE 'UTC') == checkOutHour
 * Patrón "correcto": EXTRACT(HOUR FROM scheduledDate AT TIME ZONE 'UTC') == checkOutHour + 6
 */

import prisma from "../lib/prisma";

interface DiagRow {
  cleaningId: string;
  propertyId: string;
  propertyName: string | null;
  status: string;
  scheduledDate: Date;
  storedUTCHour: number;
  storedUTCMinute: number;
  checkOutTime: string | null;
  localHourExpected: number;
  localMinuteExpected: number;
  correctUTCHour: number;
  likelyBuggy: boolean;
  reservationId: string | null;
}

async function main() {
  // Raw SQL para diagnóstico preciso con JOIN a Property
  const rows = await prisma.$queryRaw<DiagRow[]>`
    SELECT
      c.id                                                        AS "cleaningId",
      c."propertyId",
      p.name                                                      AS "propertyName",
      c.status::text,
      c."scheduledDate",
      EXTRACT(HOUR   FROM c."scheduledDate")::int                 AS "storedUTCHour",
      EXTRACT(MINUTE FROM c."scheduledDate")::int                 AS "storedUTCMinute",
      p."checkOutTime",
      c."reservationId",

      -- Hora local esperada (CDMX) según config de la propiedad
      CASE
        WHEN p."checkOutTime" IS NULL THEN 11
        ELSE SPLIT_PART(p."checkOutTime", ':', 1)::int
      END AS "localHourExpected",

      CASE
        WHEN p."checkOutTime" IS NULL THEN 0
        ELSE SPLIT_PART(p."checkOutTime", ':', 2)::int
      END AS "localMinuteExpected",

      -- Hora UTC correcta = localHour + 6 (CDMX = UTC-6 fijo)
      CASE
        WHEN p."checkOutTime" IS NULL THEN 17
        ELSE SPLIT_PART(p."checkOutTime", ':', 1)::int + 6
      END AS "correctUTCHour",

      -- Patrón "buggy": la hora UTC almacenada == la hora local esperada
      -- (es decir, falta el desplazamiento de +6h)
      CASE
        WHEN p."checkOutTime" IS NULL
          AND EXTRACT(HOUR FROM c."scheduledDate")::int = 11
          THEN true
        WHEN p."checkOutTime" IS NOT NULL
          AND EXTRACT(HOUR FROM c."scheduledDate")::int = SPLIT_PART(p."checkOutTime", ':', 1)::int
          THEN true
        ELSE false
      END AS "likelyBuggy"

    FROM "Cleaning" c
    JOIN "Property" p ON c."propertyId" = p.id
    WHERE c.status != 'CANCELLED'
    ORDER BY c."scheduledDate" DESC
  `;

  if (rows.length === 0) {
    console.log("No hay cleanings no-canceladas en DB.");
    return;
  }

  const buggy = rows.filter((r) => r.likelyBuggy);
  const clean  = rows.filter((r) => !r.likelyBuggy);

  // ── Tabla completa de candidatas ────────────────────────────────────────────
  console.log("\n=== CLEANINGS CANDIDATAS A BACKFILL (likelyBuggy = true) ===\n");
  console.log(
    `${"cleaningId".padEnd(30)} ${"property".padEnd(20)} ${"status".padEnd(14)} ${"scheduledDate (UTC)".padEnd(26)} ${"storedUTCh".padEnd(11)} ${"correctUTCh".padEnd(12)} ${"diff".padEnd(6)} ${"checkOutTime".padEnd(13)} ${"origin"}`
  );
  console.log("─".repeat(150));

  for (const r of buggy) {
    const storedH   = r.storedUTCHour;
    const correctH  = r.correctUTCHour;
    const diff      = correctH - storedH;
    const origin    = r.reservationId ? "iCal/batch" : "manual";
    console.log(
      `${r.cleaningId.padEnd(30)} ${(r.propertyName ?? r.propertyId).slice(0,19).padEnd(20)} ${r.status.padEnd(14)} ${r.scheduledDate.toISOString().padEnd(26)} ${String(storedH).padEnd(11)} ${String(correctH).padEnd(12)} ${("+"+diff).padEnd(6)} ${(r.checkOutTime ?? "null→11:00").padEnd(13)} ${origin}`
    );
  }

  // ── Resumen por status ───────────────────────────────────────────────────────
  const byStatus: Record<string, DiagRow[]> = {};
  for (const r of buggy) {
    if (!byStatus[r.status]) byStatus[r.status] = [];
    byStatus[r.status].push(r);
  }

  console.log("\n=== RESUMEN POR STATUS (candidatas buggy) ===");
  for (const [status, list] of Object.entries(byStatus)) {
    const safeToFix = ["PENDING"].includes(status);
    const caution   = ["IN_PROGRESS"].includes(status);
    const review    = ["COMPLETED"].includes(status);
    const label     = safeToFix ? "✅ corregibles" : caution ? "⚠️  con cuidado" : review ? "📁 históricas" : "❓ revisar";
    console.log(`  ${status.padEnd(16)} ${String(list.length).padEnd(5)} registros   ${label}`);
  }

  // ── Registros que NO parecen buggy ──────────────────────────────────────────
  console.log(`\n=== CLEANINGS APARENTEMENTE SANAS (likelyBuggy = false): ${clean.length} ===`);
  if (clean.length > 0) {
    console.log("  (muestra, primeras 10)");
    for (const r of clean.slice(0, 10)) {
      console.log(
        `  ${r.cleaningId.slice(0,28).padEnd(30)} ${r.status.padEnd(14)} UTC-h=${r.storedUTCHour}  correctUTCh=${r.correctUTCHour}  checkOut=${r.checkOutTime ?? "null"}`
      );
    }
  }

  // ── Conclusión ──────────────────────────────────────────────────────────────
  const pendingBuggy     = buggy.filter((r) => r.status === "PENDING");
  const inProgressBuggy  = buggy.filter((r) => r.status === "IN_PROGRESS");
  const completedBuggy   = buggy.filter((r) => r.status === "COMPLETED");
  const otherBuggy       = buggy.filter((r) => !["PENDING","IN_PROGRESS","COMPLETED"].includes(r.status));
  const icalBuggy        = buggy.filter((r) => r.reservationId !== null);
  const manualBuggy      = buggy.filter((r) => r.reservationId === null);

  console.log("\n=== CONCLUSIÓN FINAL ===");
  console.log(`Total cleanings no-canceladas analizadas : ${rows.length}`);
  console.log(`Total con timezone incorrecto (likelyBuggy): ${buggy.length}`);
  console.log(`  → PENDING (backfill seguro)            : ${pendingBuggy.length}`);
  console.log(`  → IN_PROGRESS (backfill con precaución): ${inProgressBuggy.length}`);
  console.log(`  → COMPLETED (históricas, baja prioridad): ${completedBuggy.length}`);
  console.log(`  → Otros status                         : ${otherBuggy.length}`);
  console.log(`  → Origen iCal/batch                    : ${icalBuggy.length}`);
  console.log(`  → Origen manual (sin reservationId)    : ${manualBuggy.length}`);
  console.log(`Total aparentemente sanas                : ${clean.length}`);

  console.log(`
CRITERIO EXACTO PARA BACKFILL POSTERIOR:
  UPDATE "Cleaning" c
  SET
    "scheduledDate"        = c."scheduledDate" + INTERVAL '6 hours',
    "scheduledAtPlanned"   = c."scheduledAtPlanned" + INTERVAL '6 hours'   (si aplica),
    "scheduledAtOriginal"  = c."scheduledAtOriginal" + INTERVAL '6 hours'  (si aplica)
  FROM "Property" p
  WHERE c."propertyId" = p.id
    AND c.status NOT IN ('CANCELLED', 'COMPLETED')
    AND (
      -- default 11:00 CDMX almacenado como 11:00 UTC (debería ser 17:00 UTC)
      (p."checkOutTime" IS NULL     AND EXTRACT(HOUR FROM c."scheduledDate") = 11)
      OR
      -- checkOutTime configurado almacenado como su propio UTC-hour (falta +6)
      (p."checkOutTime" IS NOT NULL AND EXTRACT(HOUR FROM c."scheduledDate") = SPLIT_PART(p."checkOutTime", ':', 1)::int)
    );

NOTA: COMPLETED se excluiría del backfill activo pero podría corregirse en pasada separada
si se necesita consistencia histórica en reportes.
`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
