// scripts/diagnose-reservations-vs-cleanings.ts
//
// Diagnóstico de consistencia entre Reservations y Cleanings.
// SOLO LECTURA — no modifica ningún dato.
//
// Uso:
//   npx tsx scripts/diagnose-reservations-vs-cleanings.ts
//   npx tsx scripts/diagnose-reservations-vs-cleanings.ts --tenant <tenantId>
//   npx tsx scripts/diagnose-reservations-vs-cleanings.ts --property <propertyId>
//
// Criterio de matching:
//   Cleaning.reservationId → Reservation.id   (vínculo directo en BD)
//   Si reservationId es null → limpieza manual (esperado, no es anomalía per se)
//
// Fecha esperada de limpieza:
//   endDate (día UTC) + property.checkOutTime  (default 11:00)
//   La diferencia aceptable es ±12 horas (overrides manuales son válidos)

import "dotenv/config";
import prisma from "@/lib/prisma";

// ─── helpers ────────────────────────────────────────────────────────────────

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const tenantIdx = args.indexOf("--tenant");
  const propIdx = args.indexOf("--property");
  return {
    tenantId: tenantIdx >= 0 ? args[tenantIdx + 1] : undefined,
    propertyId: propIdx >= 0 ? args[propIdx + 1] : undefined,
  };
}

function bucket(endDate: Date, today: Date): "PASADA" | "EN_CURSO" | "FUTURA" {
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  if (end < start) return "PASADA";
  if (end.getTime() === start.getTime()) return "EN_CURSO";
  return "FUTURA";
}

function expectedCleaningDate(endDate: Date, checkOutTime: string | null): Date {
  let hours = 11;
  let minutes = 0;
  if (checkOutTime) {
    const [h, m] = checkOutTime.split(":").map(Number);
    if (!isNaN(h)) hours = h;
    if (!isNaN(m)) minutes = m;
  }
  return new Date(
    endDate.getUTCFullYear(),
    endDate.getUTCMonth(),
    endDate.getUTCDate(),
    hours,
    minutes,
    0,
    0
  );
}

function diffHours(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60);
}

// ─── contadores ─────────────────────────────────────────────────────────────

type ReservationRow = {
  id: string;
  calendarUid: string | null;
  guestName: string | null;
  startDate: Date;
  endDate: Date;
  status: string;
  source: string;
  propertyId: string;
  propertyName: string;
  bucket: "PASADA" | "EN_CURSO" | "FUTURA";
};

type CleaningRow = {
  id: string;
  scheduledDate: Date;
  status: string;
  assignedMemberId: string | null;
  propertyId: string;
  propertyName: string;
  bucket: "PASADA" | "EN_CURSO" | "FUTURA";
};

type InconsistencyRow = {
  reservationId: string;
  cleaningId: string;
  propertyName: string;
  bucket: "PASADA" | "EN_CURSO" | "FUTURA";
  reservationStatus: string;
  cleaningStatus: string;
  issue: string;
};

type DateMismatchRow = {
  reservationId: string;
  cleaningId: string;
  propertyName: string;
  bucket: "PASADA" | "EN_CURSO" | "FUTURA";
  expectedDate: string;
  actualDate: string;
  diffHours: number;
};

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  const { tenantId: filterTenant, propertyId: filterProperty } = parseArgs();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  console.log(`\n${"=".repeat(60)}`);
  console.log("  DIAGNÓSTICO: RESERVAS vs LIMPIEZAS");
  console.log(`  Fecha hoy: ${ymd(today)}`);
  if (filterTenant) console.log(`  Filtro tenant: ${filterTenant}`);
  if (filterProperty) console.log(`  Filtro propiedad: ${filterProperty}`);
  console.log(`${"=".repeat(60)}\n`);

  // ── 1. Cargar propiedades con checkOutTime ──────────────────────────────
  const propertyWhere: any = {};
  if (filterTenant) propertyWhere.tenantId = filterTenant;
  if (filterProperty) propertyWhere.id = filterProperty;

  const properties = await (prisma as any).property.findMany({
    where: propertyWhere,
    select: { id: true, name: true, shortName: true, checkOutTime: true, tenantId: true },
  });

  const propMap = new Map<string, { name: string; checkOutTime: string | null; tenantId: string }>(
    properties.map((p: any) => [
      p.id,
      { name: p.shortName || p.name, checkOutTime: p.checkOutTime, tenantId: p.tenantId },
    ])
  );

  const propertyIds = properties.map((p: any) => p.id);

  if (propertyIds.length === 0) {
    console.log("No se encontraron propiedades con los filtros dados.");
    await prisma.$disconnect();
    return;
  }

  // ── 2. Cargar reservas CONFIRMED (excluye BLOCKED) ──────────────────────
  const reservations = await (prisma as any).reservation.findMany({
    where: {
      propertyId: { in: propertyIds },
      status: "CONFIRMED",
    },
    select: {
      id: true,
      calendarUid: true,
      guestName: true,
      startDate: true,
      endDate: true,
      status: true,
      source: true,
      propertyId: true,
    },
    orderBy: { endDate: "asc" },
  });

  // ── 3. Cargar limpiezas activas (no canceladas) ─────────────────────────
  const cleanings = await (prisma as any).cleaning.findMany({
    where: {
      propertyId: { in: propertyIds },
      status: { not: "CANCELLED" },
    },
    select: {
      id: true,
      scheduledDate: true,
      status: true,
      reservationId: true,
      assignedMemberId: true,
      propertyId: true,
    },
    orderBy: { scheduledDate: "asc" },
  });

  // ── 4. Índices de búsqueda ──────────────────────────────────────────────
  const cleaningByReservationId = new Map<string, any>();
  const orphanCleanings: CleaningRow[] = []; // sin reservationId

  for (const c of cleanings) {
    if (!c.reservationId) {
      const prop = propMap.get(c.propertyId);
      orphanCleanings.push({
        id: c.id,
        scheduledDate: c.scheduledDate,
        status: c.status,
        assignedMemberId: c.assignedMemberId,
        propertyId: c.propertyId,
        propertyName: prop?.name ?? c.propertyId,
        bucket: bucket(c.scheduledDate, today),
      });
    } else {
      cleaningByReservationId.set(c.reservationId, c);
    }
  }

  // ── 5. Analizar cada reserva ────────────────────────────────────────────
  const reservationsWithoutCleaning: ReservationRow[] = [];
  const dateMismatches: DateMismatchRow[] = [];
  const statusInconsistencies: InconsistencyRow[] = [];

  for (const r of reservations) {
    const prop = propMap.get(r.propertyId);
    const propName = prop?.name ?? r.propertyId;
    const b = bucket(r.endDate, today);

    const cleaning = cleaningByReservationId.get(r.id);

    if (!cleaning) {
      // Solo reportar como faltante si la reserva es ICAL (manual puede ser válida sin cleaning)
      // y si no es muy pasada (>90 días es normal que se haya limpiado sin vincular)
      const daysAgo = (today.getTime() - new Date(r.endDate).getTime()) / (1000 * 60 * 60 * 24);
      if (r.source === "ICAL" || b !== "PASADA" || daysAgo < 90) {
        reservationsWithoutCleaning.push({
          id: r.id,
          calendarUid: r.calendarUid,
          guestName: r.guestName,
          startDate: r.startDate,
          endDate: r.endDate,
          status: r.status,
          source: r.source,
          propertyId: r.propertyId,
          propertyName: propName,
          bucket: b,
        });
      }
      continue;
    }

    // Fecha esperada de la limpieza
    const expected = expectedCleaningDate(r.endDate, prop?.checkOutTime ?? null);
    const actual = new Date(cleaning.scheduledDate);
    const diff = diffHours(expected, actual);

    if (diff > 12) {
      dateMismatches.push({
        reservationId: r.id,
        cleaningId: cleaning.id,
        propertyName: propName,
        bucket: b,
        expectedDate: expected.toISOString().slice(0, 16),
        actualDate: actual.toISOString().slice(0, 16),
        diffHours: Math.round(diff),
      });
    }

    // Estados inconsistentes
    const inconsistency = detectInconsistency(r.status, cleaning.status, b);
    if (inconsistency) {
      statusInconsistencies.push({
        reservationId: r.id,
        cleaningId: cleaning.id,
        propertyName: propName,
        bucket: b,
        reservationStatus: r.status,
        cleaningStatus: cleaning.status,
        issue: inconsistency,
      });
    }
  }

  // ── 6. Imprimir reporte ─────────────────────────────────────────────────

  printSection(
    "1. RESERVAS CONFIRMED SIN LIMPIEZA ASOCIADA",
    reservationsWithoutCleaning.length
  );
  if (reservationsWithoutCleaning.length > 0) {
    const grouped = groupBy(reservationsWithoutCleaning, (r) => r.propertyName);
    for (const [prop, rows] of grouped) {
      console.log(`\n  📌 ${prop}`);
      for (const r of rows) {
        console.log(
          `    [${r.bucket}] ${ymd(r.startDate)} → ${ymd(r.endDate)} | ` +
          `source:${r.source} | uid:${r.calendarUid ?? "-"} | ` +
          `guest:${r.guestName ?? "-"} | id:${r.id}`
        );
      }
    }
  }

  printSection(
    "2. LIMPIEZAS SIN RESERVA ASOCIADA (reservationId null)",
    orphanCleanings.length
  );
  if (orphanCleanings.length > 0) {
    const grouped = groupBy(orphanCleanings, (c) => c.propertyName);
    for (const [prop, rows] of grouped) {
      console.log(`\n  📌 ${prop}`);
      for (const c of rows) {
        console.log(
          `    [${c.bucket}] fecha:${ymd(c.scheduledDate)} | ` +
          `status:${c.status} | ` +
          `asignada:${c.assignedMemberId ?? "no"} | id:${c.id}`
        );
      }
    }
  }

  printSection(
    "3. FECHAS DESALINEADAS (diferencia > 12 horas)",
    dateMismatches.length
  );
  if (dateMismatches.length > 0) {
    const grouped = groupBy(dateMismatches, (r) => r.propertyName);
    for (const [prop, rows] of grouped) {
      console.log(`\n  📌 ${prop}`);
      for (const r of rows) {
        console.log(
          `    [${r.bucket}] esperada:${r.expectedDate} | ` +
          `real:${r.actualDate} | diff:${r.diffHours}h | ` +
          `res:${r.reservationId} cln:${r.cleaningId}`
        );
      }
    }
  }

  printSection(
    "4. ESTADOS INCONSISTENTES (reserva/limpieza)",
    statusInconsistencies.length
  );
  if (statusInconsistencies.length > 0) {
    const grouped = groupBy(statusInconsistencies, (r) => r.propertyName);
    for (const [prop, rows] of grouped) {
      console.log(`\n  📌 ${prop}`);
      for (const r of rows) {
        console.log(
          `    [${r.bucket}] res:${r.reservationStatus} → cln:${r.cleaningStatus} | ` +
          `⚠ ${r.issue} | res:${r.reservationId}`
        );
      }
    }
  }

  // ── 7. Resumen ejecutivo ────────────────────────────────────────────────
  console.log(`\n${"=".repeat(60)}`);
  console.log("  RESUMEN EJECUTIVO");
  console.log(`${"=".repeat(60)}`);
  console.log(`  Propiedades analizadas  : ${propertyIds.length}`);
  console.log(`  Reservas CONFIRMED      : ${reservations.length}`);
  console.log(`  Limpiezas activas       : ${cleanings.length}`);
  console.log(`  Limpiezas vinculadas    : ${cleaningByReservationId.size}`);
  console.log(`  Limpiezas manuales (s/res): ${orphanCleanings.length}`);
  console.log(``);
  console.log(`  ❌ Reservas sin limpieza : ${reservationsWithoutCleaning.length}`);
  console.log(`     Pasadas              : ${reservationsWithoutCleaning.filter(r => r.bucket === "PASADA").length}`);
  console.log(`     En curso             : ${reservationsWithoutCleaning.filter(r => r.bucket === "EN_CURSO").length}`);
  console.log(`     Futuras              : ${reservationsWithoutCleaning.filter(r => r.bucket === "FUTURA").length}`);
  console.log(`  ⚠  Fechas desalineadas  : ${dateMismatches.length}`);
  console.log(`  ⚠  Estados inconsistentes: ${statusInconsistencies.length}`);

  const totalMismatches =
    reservationsWithoutCleaning.length +
    dateMismatches.length +
    statusInconsistencies.length;

  const activeMismatches =
    reservationsWithoutCleaning.filter(r => r.bucket !== "PASADA").length +
    dateMismatches.filter(r => r.bucket !== "PASADA").length +
    statusInconsistencies.filter(r => r.bucket !== "PASADA").length;

  const historicalMismatches = totalMismatches - activeMismatches;

  let verdictMsg: string;
  if (totalMismatches === 0) {
    verdictMsg = "✅ Sistema completamente CONSISTENTE. Sin anomalías en ninguna categoría.";
  } else if (activeMismatches === 0) {
    verdictMsg = `✅ Sistema CONSISTENTE en reservas activas/futuras. ${historicalMismatches} anomalía(s) solo en históricas.`;
  } else {
    verdictMsg = `❌ INCONSISTENCIAS ACTIVAS detectadas (${activeMismatches}) — requieren atención.`;
  }

  console.log(`\n  VEREDICTO: ${verdictMsg}`);
  console.log(`${"=".repeat(60)}\n`);

  await prisma.$disconnect();
}

// ─── Detectar inconsistencia de estados ──────────────────────────────────────
function detectInconsistency(
  resStatus: string,
  cleanStatus: string,
  b: "PASADA" | "EN_CURSO" | "FUTURA"
): string | null {
  if (resStatus === "CONFIRMED" && cleanStatus === "CANCELLED") {
    return "Reserva CONFIRMED pero limpieza CANCELLED";
  }
  if (resStatus === "CONFIRMED" && b === "PASADA" && cleanStatus === "PENDING") {
    return "Reserva pasada CONFIRMED con limpieza aún PENDING (nunca se completó)";
  }
  return null;
}

// ─── Agrupar por clave ────────────────────────────────────────────────────────
function groupBy<T>(arr: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of arr) {
    const k = key(item);
    const list = map.get(k) ?? [];
    list.push(item);
    map.set(k, list);
  }
  return map;
}

// ─── Header de sección ────────────────────────────────────────────────────────
function printSection(title: string, count: number) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`  Total: ${count}`);
  console.log(`${"─".repeat(60)}`);
  if (count === 0) console.log("  ✅ Sin anomalías en esta categoría.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
