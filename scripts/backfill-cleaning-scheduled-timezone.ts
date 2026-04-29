/**
 * scripts/backfill-cleaning-scheduled-timezone.ts
 *
 * Diagnóstico + backfill seguro: corrige cleanings donde scheduledAtPlanned /
 * scheduledAtOriginal fueron almacenados como hora local CDMX interpretada como UTC.
 *
 * BUG ORIGINAL:
 *   Antes del fix de buildCleaningScheduledDate, la hora de checkout local CDMX
 *   (ej. 11:00) se guardaba directamente como 11:00Z en vez de 17:00Z (= 11:00 CDMX).
 *   En UI esto aparece como 5:00 a.m. en vez de 11:00 a.m.
 *
 * PATRÓN DE DETECCIÓN:
 *   UTC-hour(scheduledAtPlanned) == checkout-hour-local(propiedad)
 *   Ej: checkOutTime="11:00" y scheduledAtPlanned=...T11:00Z → buggy (debería ser T17:00Z)
 *
 * QUÉ SE CORRIGE:
 *   scheduledAtPlanned  → +6h  (CDMX offset)
 *   scheduledAtOriginal → +6h  si también tiene el mismo patrón buggy
 *
 * POR QUÉ scheduledDate NO SE TOCA:
 *   scheduledDate es @db.Date (PostgreSQL DATE — solo fecha, sin hora ni timezone).
 *   Independientemente del bug de hora, el día calendario almacenado es correcto:
 *     Bug:      scheduledAtPlanned = 2026-05-01T11:00Z → scheduledDate = 2026-05-01 ✅
 *     Correcto: scheduledAtPlanned = 2026-05-01T17:00Z → scheduledDate = 2026-05-01 ✅
 *   Para checkouts tardíos (ej. 22:00 CDMX = 04:00Z+1), el día CDMX sigue siendo
 *   el día de checkout y scheduledDate ya lo refleja correctamente.
 *   scheduledDate se deja intacto en todos los casos.
 *
 * SEGURIDAD:
 *   - Dry-run por defecto (--apply para escribir)
 *   - Solo toca PENDING e IN_PROGRESS (no COMPLETED, no CANCELLED)
 *   - Pre-flight antes de cada update (verifica que el estado no cambió)
 *   - Idempotente: segunda ejecución no produce cambios adicionales
 *   - Cleanings con isScheduleOverridden=true se reportan con advertencia
 *
 * USO:
 *   npx tsx scripts/backfill-cleaning-scheduled-timezone.ts             # dry-run
 *   npx tsx scripts/backfill-cleaning-scheduled-timezone.ts --apply     # ejecutar
 *   npx tsx scripts/backfill-cleaning-scheduled-timezone.ts --tenantId=<id>
 *   npx tsx scripts/backfill-cleaning-scheduled-timezone.ts --propertyId=<id>
 *   npx tsx scripts/backfill-cleaning-scheduled-timezone.ts --tenantId=<id> --apply
 */

import "dotenv/config";
import prisma from "../lib/prisma";

// ─── CLI Args ─────────────────────────────────────────────────────────────────

const DRY_RUN = !process.argv.includes("--apply");

const tenantIdArg  = process.argv.find((a) => a.startsWith("--tenantId="));
const TENANT_ID    = tenantIdArg?.split("=")[1];

const propertyIdArg = process.argv.find((a) => a.startsWith("--propertyId="));
const PROPERTY_ID   = propertyIdArg?.split("=")[1];

// ─── Constantes ───────────────────────────────────────────────────────────────

const CDMX_OFFSET_MS = 6 * 3_600_000; // CDMX = UTC-6 permanente

// Estados activos que SÍ se tocan (COMPLETED y CANCELLED excluidos)
const ACTIVE_STATUSES = ["PENDING", "IN_PROGRESS"];

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface CleaningRow {
  id: string;
  tenantId: string;
  propertyId: string;
  status: string;
  scheduledDate: Date;
  scheduledAtPlanned: Date;       // garantizado not-null por el where clause
  scheduledAtOriginal: Date | null;
  reservationId: string | null;
  isScheduleOverridden: boolean;
  property: {
    name: string;
    shortName: string | null;
    checkOutTime: string | null;
  };
}

interface FixPlan {
  id: string;
  propertyLabel: string;
  checkOutTime: string | null;
  status: string;
  scheduledDate: Date;
  reservationId: string | null;
  isScheduleOverridden: boolean;

  // scheduledAtPlanned
  plannedActual: Date;
  plannedCorrected: Date;
  plannedBuggy: boolean;

  // scheduledAtOriginal (puede ser null si no está seteado)
  originalActual: Date | null;
  originalCorrected: Date | null;
  originalBuggy: boolean;

  reason: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseCheckOut(checkOutTime: string | null): { hour: number; minute: number } {
  if (!checkOutTime) return { hour: 11, minute: 0 };
  const parts = checkOutTime.split(":");
  const h = parseInt(parts[0] ?? "11", 10);
  const m = parseInt(parts[1] ?? "0", 10);
  return { hour: isNaN(h) ? 11 : h, minute: isNaN(m) ? 0 : m };
}

/**
 * Detecta si un timestamp tiene el patrón buggy:
 * su UTC-hour coincide con la hora local de checkout (en vez de hora+6).
 * También verifica los minutos para evitar falsos positivos.
 */
function isTimestampBuggy(ts: Date, checkOutTime: string | null): boolean {
  const { hour, minute } = parseCheckOut(checkOutTime);
  return ts.getUTCHours() === hour && ts.getUTCMinutes() === minute;
}

function addCdmxOffset(ts: Date): Date {
  return new Date(ts.getTime() + CDMX_OFFSET_MS);
}

/** Formatea un timestamp en hora CDMX sin depender de Intl (seguro en Node.js sin full ICU) */
function fmtCDMX(d: Date | null): string {
  if (!d) return "(null)";
  const cdmx = new Date(d.getTime() - CDMX_OFFSET_MS);
  const h24  = cdmx.getUTCHours();
  const m    = String(cdmx.getUTCMinutes()).padStart(2, "0");
  const dd   = String(cdmx.getUTCDate()).padStart(2, "0");
  const months = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  const month  = months[cdmx.getUTCMonth()] ?? "???";
  const h12    = h24 % 12 || 12;
  const ampm   = h24 >= 12 ? "p.m." : "a.m.";
  return `${dd}-${month} ${String(h12).padStart(2," ")}:${m} ${ampm}`;
}

function fmtUTC(d: Date | null): string {
  return d ? d.toISOString() : "(null)";
}

function sep(char = "─", n = 120): string {
  return char.repeat(n);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${sep("═")}`);
  console.log("BACKFILL: cleanings con scheduledAtPlanned/scheduledAtOriginal en timezone incorrecto");
  console.log(`Modo  : ${DRY_RUN ? "DRY-RUN (sin cambios)" : "⚠️  APPLY (escribirá en DB)"}`);
  if (TENANT_ID)   console.log(`Filtro tenantId   : ${TENANT_ID}`);
  if (PROPERTY_ID) console.log(`Filtro propertyId : ${PROPERTY_ID}`);
  console.log(sep("═"));

  // ─── 1. Fetch ──────────────────────────────────────────────────────────────

  const where: Record<string, unknown> = {
    status: { in: ACTIVE_STATUSES },
    scheduledAtPlanned: { not: null },
  };
  if (TENANT_ID)   where.tenantId   = TENANT_ID;
  if (PROPERTY_ID) where.propertyId = PROPERTY_ID;

  const rows: CleaningRow[] = await (prisma as any).cleaning.findMany({
    where,
    select: {
      id: true,
      tenantId: true,
      propertyId: true,
      status: true,
      scheduledDate: true,
      scheduledAtPlanned: true,
      scheduledAtOriginal: true,
      reservationId: true,
      isScheduleOverridden: true,
      property: {
        select: {
          name: true,
          shortName: true,
          checkOutTime: true,
        },
      },
    },
    orderBy: { scheduledAtPlanned: "asc" },
  });

  console.log(`\nCleanings PENDING/IN_PROGRESS con scheduledAtPlanned: ${rows.length}`);

  if (rows.length === 0) {
    console.log("No hay cleanings activas que analizar.");
    return;
  }

  // ─── 2. Detectar candidatas ────────────────────────────────────────────────

  const plans: FixPlan[] = [];

  for (const c of rows) {
    const planned  = c.scheduledAtPlanned;   // never null (filtrado en where)
    const original = c.scheduledAtOriginal;

    const plannedBuggy  = isTimestampBuggy(planned, c.property.checkOutTime);
    const originalBuggy = original !== null && isTimestampBuggy(original, c.property.checkOutTime);

    if (!plannedBuggy && !originalBuggy) continue; // datos ya correctos → skip

    const { hour: coHour, minute: coMin } = parseCheckOut(c.property.checkOutTime);

    const reasons: string[] = [];
    if (plannedBuggy) {
      reasons.push(
        `plannedUTC ${planned.getUTCHours()}:${String(planned.getUTCMinutes()).padStart(2,"0")} ` +
        `== checkout local ${coHour}:${String(coMin).padStart(2,"0")} (falta +6h)`
      );
    }
    if (originalBuggy && original) {
      reasons.push(
        `originalUTC ${original.getUTCHours()}:${String(original.getUTCMinutes()).padStart(2,"0")} ` +
        `== checkout local ${coHour}:${String(coMin).padStart(2,"0")} (falta +6h)`
      );
    }
    if (c.isScheduleOverridden) {
      reasons.push("⚠️ isScheduleOverridden=true");
    }

    plans.push({
      id:                  c.id,
      propertyLabel:       c.property.shortName ?? c.property.name,
      checkOutTime:        c.property.checkOutTime,
      status:              c.status,
      scheduledDate:       c.scheduledDate,
      reservationId:       c.reservationId,
      isScheduleOverridden: c.isScheduleOverridden,

      plannedActual:       planned,
      plannedCorrected:    addCdmxOffset(planned),
      plannedBuggy,

      originalActual:      original,
      originalCorrected:   originalBuggy && original ? addCdmxOffset(original) : null,
      originalBuggy,

      reason: reasons.join(" | "),
    });
  }

  // ─── 3. Reporte detallado ──────────────────────────────────────────────────

  if (plans.length === 0) {
    console.log("\n✅ Todos los timestamps son correctos. No hay nada que corregir.");
    return;
  }

  console.log(`\n${sep()}`);
  console.log(`CANDIDATAS A CORREGIR: ${plans.length}`);
  console.log(sep());

  // Cabecera de tabla
  const COL = {
    id:        28,
    prop:      12,
    status:    13,
    date:      12,
    planned:   22,
    corrected: 22,
    orig:      22,
    origCorr:  22,
  };

  console.log(
    "cleaningId".padEnd(COL.id) +
    "propiedad".padEnd(COL.prop) +
    "status".padEnd(COL.status) +
    "schedDate".padEnd(COL.date) +
    "plannedActual(CDMX)".padEnd(COL.planned) +
    "plannedCorregido(CDMX)".padEnd(COL.corrected) +
    "origActual(CDMX)".padEnd(COL.orig) +
    "origCorregido(CDMX)".padEnd(COL.origCorr) +
    "flags"
  );
  console.log(sep());

  for (const p of plans) {
    const flags: string[] = [];
    if (p.isScheduleOverridden) flags.push("OVERRIDE⚠️");
    if (!p.reservationId)       flags.push("manual");
    if (!p.originalBuggy && p.originalActual) flags.push("orig-ya-ok");

    console.log(
      p.id.slice(0, COL.id - 1).padEnd(COL.id) +
      p.propertyLabel.slice(0, COL.prop - 1).padEnd(COL.prop) +
      p.status.padEnd(COL.status) +
      p.scheduledDate.toISOString().slice(0, 10).padEnd(COL.date) +
      fmtCDMX(p.plannedActual).padEnd(COL.planned) +
      fmtCDMX(p.plannedCorrected).padEnd(COL.corrected) +
      (p.originalActual ? fmtCDMX(p.originalActual) : "(null)").padEnd(COL.orig) +
      (p.originalCorrected
        ? fmtCDMX(p.originalCorrected)
        : p.originalBuggy ? "(null→skip)"
        : p.originalActual ? "ya correcto"
        : "(null)").padEnd(COL.origCorr) +
      flags.join(" ")
    );
  }

  // También mostrar el UTC de plannedActual para verificación cruzada
  console.log(`\n${sep("─", 80)}`);
  console.log("DETALLE UTC — para verificación cruzada:");
  console.log(sep("─", 80));
  for (const p of plans) {
    console.log(
      `  ${p.id.slice(0,26).padEnd(28)} ` +
      `planned UTC: ${fmtUTC(p.plannedActual).padEnd(28)} ` +
      `→ corregido UTC: ${fmtUTC(p.plannedCorrected)}`
    );
  }

  // ─── 4. Resumen por propiedad ──────────────────────────────────────────────

  console.log(`\n${sep()}`);
  console.log("RESUMEN POR PROPIEDAD:");
  console.log(sep());

  const byProp = new Map<string, { label: string; checkOut: string | null; statuses: Map<string, number> }>();
  for (const p of plans) {
    if (!byProp.has(p.propertyLabel)) {
      byProp.set(p.propertyLabel, { label: p.propertyLabel, checkOut: p.checkOutTime, statuses: new Map() });
    }
    const entry = byProp.get(p.propertyLabel)!;
    entry.statuses.set(p.status, (entry.statuses.get(p.status) ?? 0) + 1);
  }

  for (const [, info] of byProp) {
    const statusLine = [...info.statuses.entries()].map(([s, n]) => `${s}:${n}`).join(", ");
    const checkout = info.checkOut ?? "null→11:00";
    console.log(
      `  ${info.label.padEnd(20)}  checkOut=${checkout.padEnd(6)}  [${statusLine}]`
    );
  }

  // ─── 5. Justificación scheduledDate ───────────────────────────────────────

  console.log(`\n${sep()}`);
  console.log("POR QUÉ scheduledDate NO SE MODIFICA:");
  console.log(sep());
  console.log(`
  scheduledDate es @db.Date → PostgreSQL lo almacena como DATE (solo fecha, sin hora).

  El día calendario almacenado representa el día de checkout de la reserva en CDMX.
  Este día es correcto con o sin el bug de hora:

    Bug:      scheduledAtPlanned = 2026-05-01T11:00:00Z → scheduledDate = DATE '2026-05-01' ✅
    Correcto: scheduledAtPlanned = 2026-05-01T17:00:00Z → scheduledDate = DATE '2026-05-01' ✅

  Para checkouts tardíos (ej. 22:00 CDMX = 04:00Z del día siguiente):
    El día CDMX sigue siendo el día de checkout → scheduledDate ya es correcto.

  Verificación sobre los candidatos actuales:`);

  let scheduledDateOk = 0;
  let scheduledDateSuspect = 0;
  for (const p of plans) {
    // Si corregir plannedActual +6h produce una fecha UTC diferente al scheduledDate,
    // lo notamos (no es un error, solo informatico).
    const correctedDateUTC  = p.plannedCorrected.toISOString().slice(0, 10);
    const scheduledDateStr  = p.scheduledDate.toISOString().slice(0, 10);
    // La fecha CDMX del plannedCorrected es lo que realmente importa
    const correctedCDMXDate = new Date(p.plannedCorrected.getTime() - CDMX_OFFSET_MS)
      .toISOString().slice(0, 10);
    if (correctedCDMXDate !== scheduledDateStr) {
      scheduledDateSuspect++;
      console.log(
        `  ⚠️  ${p.id.slice(0,28)} scheduledDate=${scheduledDateStr} ` +
        `correctedCDMX=${correctedCDMXDate} (UTC=${correctedDateUTC}) — revisar`
      );
    } else {
      scheduledDateOk++;
    }
  }
  if (scheduledDateSuspect === 0) {
    console.log(`  ✅ Todos los ${scheduledDateOk} candidatos: scheduledDate es correcto, no se toca.`);
  } else {
    console.log(
      `  ✅ ${scheduledDateOk} correctos. ⚠️ ${scheduledDateSuspect} a revisar ` +
      `(ver arriba — posiblemente checkouts nocturnos con distorsión de fecha).`
    );
  }

  // ─── 6. Totales finales ────────────────────────────────────────────────────

  const byStatus = new Map<string, number>();
  for (const p of plans) byStatus.set(p.status, (byStatus.get(p.status) ?? 0) + 1);

  const overrideCount = plans.filter((p) => p.isScheduleOverridden).length;

  console.log(`\n${sep()}`);
  console.log("TOTALES:");
  for (const [status, count] of byStatus) {
    const note = status === "PENDING" ? "✅ seguro" : status === "IN_PROGRESS" ? "⚠️ con cuidado" : "";
    console.log(`  ${status.padEnd(16)}  ${String(count).padEnd(4)} candidatas  ${note}`);
  }
  console.log(`  ${"TOTAL".padEnd(16)}  ${plans.length}`);
  if (overrideCount > 0) {
    console.log(`\n  ⚠️  ${overrideCount} tienen isScheduleOverridden=true — revisar manualmente antes de aplicar.`);
  }
  console.log(sep());

  // ─── 7. Dry-run → exit ────────────────────────────────────────────────────

  if (DRY_RUN) {
    console.log(`\n[DRY-RUN] Sin cambios. Para aplicar:`);
    console.log(`  npx tsx scripts/backfill-cleaning-scheduled-timezone.ts --apply`);
    if (TENANT_ID)   console.log(`  npx tsx scripts/backfill-cleaning-scheduled-timezone.ts --tenantId=${TENANT_ID} --apply`);
    if (PROPERTY_ID) console.log(`  npx tsx scripts/backfill-cleaning-scheduled-timezone.ts --propertyId=${PROPERTY_ID} --apply`);
    console.log();
    return;
  }

  // ─── 8. Apply ─────────────────────────────────────────────────────────────

  console.log(`\n⚠️  APPLY: procesando ${plans.length} registros...\n`);

  let countOk = 0;
  let countSkipped = 0;
  let countError = 0;

  for (const p of plans) {
    try {
      // Pre-flight: verificar que el registro no cambió desde la lectura
      const current = await (prisma as any).cleaning.findUnique({
        where: { id: p.id },
        select: { status: true, scheduledAtPlanned: true },
      });

      if (!current) {
        console.warn(`  ⚠️  SKIP ${p.id.slice(0,26)}: registro no encontrado`);
        countSkipped++;
        continue;
      }

      if (!ACTIVE_STATUSES.includes(current.status)) {
        console.warn(`  ⚠️  SKIP ${p.id.slice(0,26)}: status cambió a "${current.status}" (ya no activo)`);
        countSkipped++;
        continue;
      }

      // Idempotencia: si scheduledAtPlanned ya fue corregido (≠ plannedActual), saltar
      const currentPlannedMs = new Date(current.scheduledAtPlanned as Date).getTime();
      const diff = Math.abs(currentPlannedMs - p.plannedActual.getTime());
      if (diff > 1_000) {
        console.warn(
          `  ⚠️  SKIP ${p.id.slice(0,26)}: scheduledAtPlanned cambió desde la lectura ` +
          `(diff=${diff}ms) — posiblemente ya corregido o modificado externamente`
        );
        countSkipped++;
        continue;
      }

      // Construir data de update — solo scheduledAtPlanned y scheduledAtOriginal
      const updateData: Record<string, Date> = {
        scheduledAtPlanned: p.plannedCorrected,
      };
      if (p.originalCorrected !== null) {
        updateData.scheduledAtOriginal = p.originalCorrected;
      }

      await (prisma as any).cleaning.update({
        where: { id: p.id },
        data: updateData,
      });

      const origMsg = p.originalCorrected
        ? ` | orig: ${fmtCDMX(p.originalActual)} → ${fmtCDMX(p.originalCorrected)}`
        : "";

      console.log(
        `  ✅ ${p.id.slice(0,26).padEnd(28)} (${p.propertyLabel.slice(0,12).padEnd(12)}) ` +
        `planned: ${fmtCDMX(p.plannedActual)} → ${fmtCDMX(p.plannedCorrected)}${origMsg}`
      );
      countOk++;

    } catch (err) {
      console.error(`  ❌ ERROR ${p.id.slice(0,26)}:`, err);
      countError++;
    }
  }

  console.log(`\n${sep("═")}`);
  console.log(`APPLY completado:`);
  console.log(`  ✅ Corregidos : ${countOk}`);
  console.log(`  ⚠️  Omitidos   : ${countSkipped}`);
  console.log(`  ❌ Errores    : ${countError}`);
  console.log(sep("═"));
  console.log();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nError fatal:", err);
    process.exit(1);
  });
