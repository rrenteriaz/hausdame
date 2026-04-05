// scripts/fix-past-cancelled-reservations.ts
//
// Corrige reservas iCal pasadas que fueron incorrectamente marcadas como CANCELLED
// por el sync cuando el proveedor (Airbnb, Booking, etc.) eliminó eventos pasados
// de su feed — comportamiento estándar de los proveedores.
//
// Criterio seguro de corrección:
//   - source = ICAL  (originada del sync, no creada manualmente)
//   - status = CANCELLED
//   - endDate < hoy  (ya terminó — no tocar reservas futuras/en curso)
//   - calendarUid IS NOT NULL
//
// Uso:
//   npx tsx scripts/fix-past-cancelled-reservations.ts            → dry-run
//   npx tsx scripts/fix-past-cancelled-reservations.ts --apply    → aplica cambios

import "dotenv/config";
import prisma from "@/lib/prisma";

function parseArgs() {
  const apply = process.argv.includes("--apply");
  return { apply, dryRun: !apply };
}

async function main() {
  const { apply, dryRun } = parseArgs();

  console.log(`\n=== fix-past-cancelled-reservations ===`);
  console.log(`Modo: ${dryRun ? "DRY-RUN (sin cambios)" : "APPLY (escribe en BD)"}\n`);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Buscar reservas candidatas
  const candidates = await (prisma as any).reservation.findMany({
    where: {
      source: "ICAL",
      status: "CANCELLED",
      calendarUid: { not: null },
      endDate: { lt: today },
    },
    select: {
      id: true,
      calendarUid: true,
      startDate: true,
      endDate: true,
      tenantId: true,
      propertyId: true,
      property: { select: { name: true, shortName: true } },
    },
    orderBy: { endDate: "desc" },
  });

  console.log(`Reservas pasadas incorrectamente canceladas encontradas: ${candidates.length}\n`);

  if (candidates.length === 0) {
    console.log("Nada que corregir.");
    await prisma.$disconnect();
    return;
  }

  // Agrupar por propiedad para mejor legibilidad
  const byProperty = new Map<string, typeof candidates>();
  for (const r of candidates) {
    const key = r.property?.shortName || r.property?.name || r.propertyId;
    const list = byProperty.get(key) ?? [];
    list.push(r);
    byProperty.set(key, list);
  }

  for (const [propName, reservations] of byProperty) {
    console.log(`  ${propName}: ${reservations.length} reserva(s)`);
    for (const r of reservations) {
      const start = r.startDate.toISOString().slice(0, 10);
      const end = r.endDate.toISOString().slice(0, 10);
      console.log(`    - ${r.id}  ${start} → ${end}  uid:${r.calendarUid}`);
    }
  }

  if (dryRun) {
    console.log(`\n[DRY-RUN] Se actualizarían ${candidates.length} reservas a CONFIRMED.`);
    console.log("Ejecuta con --apply para aplicar los cambios.\n");
    await prisma.$disconnect();
    return;
  }

  // Aplicar corrección en lotes de 100
  const BATCH = 100;
  let updated = 0;

  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);
    const ids = batch.map((r: any) => r.id);

    await (prisma as any).reservation.updateMany({
      where: { id: { in: ids } },
      data: { status: "CONFIRMED", updatedAt: new Date() },
    });

    updated += ids.length;
    console.log(`  Actualizadas ${updated}/${candidates.length}...`);
  }

  console.log(`\n✓ ${updated} reservas restauradas a CONFIRMED.\n`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
