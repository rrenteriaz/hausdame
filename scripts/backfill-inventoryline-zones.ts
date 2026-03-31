/**
 * Backfill de InventoryLine.propertyZoneId para todas las líneas activas
 * que aún no tienen zona asignada.
 *
 * -------------------------------------------------------------------
 * Matching:
 *   InventoryLine.propertyId + InventoryLine.areaNormalized
 *       → PropertyZone.propertyId + PropertyZone.normalizedName
 *
 * La Fase 3 garantizó que existe exactamente un PropertyZone OPERATIONAL
 * por cada (propertyId, areaNormalized) activo. Este script asigna el
 * puente sin tocar ningún otro campo de InventoryLine.
 *
 * ANOMALÍA CONOCIDA (heredada de Fase 3):
 * Propiedad bcwnaouffz46zcvv97wkj5e1, areaNormalized = "baño".
 * El match funcionará correctamente (verbatim, Opción A).
 * El cleanup de esa inconsistencia se realiza en fase separada.
 * -------------------------------------------------------------------
 *
 * Uso:
 *   npx tsx scripts/backfill-inventoryline-zones.ts                   # dry-run (default)
 *   npx tsx scripts/backfill-inventoryline-zones.ts --apply           # escribir a DB
 *   npx tsx scripts/backfill-inventoryline-zones.ts --tenantId=X --apply
 */

import "dotenv/config";
import prisma from "../lib/prisma";

const DRY_RUN = !process.argv.includes("--apply");
const tenantIdArg = process.argv.find((a) => a.startsWith("--tenantId="));
const TENANT_ID_FILTER = tenantIdArg?.split("=")[1];

async function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY-RUN (use --apply to write)" : "APPLY"}`);
  if (TENANT_ID_FILTER) console.log(`Tenant filter: ${TENANT_ID_FILTER}`);

  // ─── Preflight: verificar que no haya (propertyId, normalizedName) duplicados ───
  // La restricción @@unique en PropertyZone lo garantiza a nivel DB, pero lo
  // verificamos explícitamente para detectar cualquier inconsistencia de datos.
  const allZones = await prisma.propertyZone.findMany({
    where: TENANT_ID_FILTER ? { tenantId: TENANT_ID_FILTER } : {},
    select: { id: true, propertyId: true, normalizedName: true, zoneType: true },
  });

  const zoneIndex = new Map<string, { id: string; zoneType: string; duplicates: number }>();
  let prefightFail = false;

  for (const zone of allZones) {
    const key = `${zone.propertyId}::${zone.normalizedName}`;
    if (zoneIndex.has(key)) {
      console.error(
        `[ERROR] Duplicado en PropertyZone: propertyId=${zone.propertyId} normalizedName="${zone.normalizedName}"`
      );
      zoneIndex.get(key)!.duplicates++;
      prefightFail = true;
    } else {
      zoneIndex.set(key, { id: zone.id, zoneType: zone.zoneType, duplicates: 0 });
    }
  }

  if (prefightFail) {
    console.error("\n[ABORT] Se encontraron duplicados en PropertyZone. Resolver antes de continuar.");
    process.exit(1);
  }

  console.log(`PropertyZones cargadas en índice: ${zoneIndex.size}`);

  // ─── Obtener InventoryLines candidatas ───────────────────────────────────────
  const lines = await prisma.inventoryLine.findMany({
    where: {
      isActive: true,
      propertyZoneId: null,
      ...(TENANT_ID_FILTER ? { tenantId: TENANT_ID_FILTER } : {}),
    },
    select: {
      id: true,
      propertyId: true,
      tenantId: true,
      area: true,
      areaNormalized: true,
    },
    orderBy: [{ propertyId: "asc" }, { areaNormalized: "asc" }],
  });

  // Líneas ya asignadas (para reporte de contexto)
  const alreadyAssigned = await prisma.inventoryLine.count({
    where: {
      isActive: true,
      propertyZoneId: { not: null },
      ...(TENANT_ID_FILTER ? { tenantId: TENANT_ID_FILTER } : {}),
    },
  });

  console.log(`Lines already assigned : ${alreadyAssigned}`);
  console.log(`Lines pending assignment: ${lines.length}\n`);

  let updated  = 0;
  let skipped  = 0; // líneas que ya tenían propertyZoneId (no deberían llegar aquí)
  let warnNoZone     = 0;
  let warnVirtual    = 0;

  for (const line of lines) {
    const key = `${line.propertyId}::${line.areaNormalized}`;
    const zone = zoneIndex.get(key);

    if (!zone) {
      warnNoZone++;
      console.warn(
        `  [WARN] No zone found — lineId=${line.id} propertyId=${line.propertyId} areaNormalized="${line.areaNormalized}" area="${line.area}"`
      );
      continue;
    }

    if (zone.zoneType === "VIRTUAL") {
      warnVirtual++;
      console.warn(
        `  [WARN] Matched VIRTUAL zone — lineId=${line.id} areaNormalized="${line.areaNormalized}" zoneId=${zone.id} — skipped`
      );
      continue;
    }

    updated++;
    if (DRY_RUN) {
      console.log(
        `  [DRY]  lineId=${line.id} area="${line.area}" → Would assign zoneId=${zone.id}`
      );
    } else {
      await prisma.inventoryLine.update({
        where: { id: line.id },
        data: { propertyZoneId: zone.id },
      });
      console.log(
        `  [OK]   lineId=${line.id} area="${line.area}" → Assigned zoneId=${zone.id}`
      );
    }
  }

  // ─── Resumen ─────────────────────────────────────────────────────────────────
  console.log("\n─────────────────────────────────────────────────────────────");
  console.log(`Total processed : ${lines.length}`);
  console.log(`${DRY_RUN ? "Would update" : "Updated"}    : ${updated}`);
  console.log(`Skipped         : ${skipped}`);
  console.log(`Warnings        : ${warnNoZone + warnVirtual}`);
  if (warnNoZone > 0) {
    console.log(`  - No matching zone : ${warnNoZone}`);
  }
  if (warnVirtual > 0) {
    console.log(`  - Matched VIRTUAL  : ${warnVirtual}`);
  }
  console.log("─────────────────────────────────────────────────────────────");

  if (!DRY_RUN) {
    // Verificación post-apply: cuántas líneas activas siguen sin zona
    const remaining = await prisma.inventoryLine.count({
      where: {
        isActive: true,
        propertyZoneId: null,
        ...(TENANT_ID_FILTER ? { tenantId: TENANT_ID_FILTER } : {}),
      },
    });
    console.log(`\nPost-apply check:`);
    console.log(
      `  InventoryLine WHERE propertyZoneId IS NULL AND isActive = true : ${remaining}`
    );
    if (remaining === 0) {
      console.log("  ✓ Todas las líneas activas tienen propertyZoneId asignado.");
    } else {
      console.log(`  ⚠️  ${remaining} línea(s) activa(s) sin zona — revisar warnings arriba.`);
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
