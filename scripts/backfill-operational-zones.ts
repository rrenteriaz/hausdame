/**
 * Backfill de zonas OPERATIONAL por propiedad, derivadas desde InventoryLine.area.
 * Idempotente: upsert por @@unique([propertyId, normalizedName]).
 *
 * -------------------------------------------------------------------
 * DECISIÓN TÉCNICA — Opción A (Fase 3)
 * -------------------------------------------------------------------
 * Se usa `InventoryLine.areaNormalized` VERBATIM como
 * `PropertyZone.normalizedName`. Esto garantiza compatibilidad directa
 * en Fase 5 cuando InventoryLine.propertyZoneId se asigne via lookup:
 *   InventoryLine.areaNormalized → PropertyZone.normalizedName
 *
 * -------------------------------------------------------------------
 * ANOMALÍA HISTÓRICA CONOCIDA — pendiente cleanup
 * -------------------------------------------------------------------
 * Propiedad : bcwnaouffz46zcvv97wkj5e1
 * Área      : "Baño"
 * areaNormalized en DB : "baño"  ← con ñ (normalización antigua)
 * normalizeName("Baño") canónica: "bano" ← sin ñ
 *
 * Esta inconsistencia preexiste a esta fase. NO se corrige aquí para
 * no alterar InventoryLine histórico. Deberá resolverse en una fase
 * dedicada de cleanup/migración:
 *   1. Actualizar InventoryLine.areaNormalized "baño" → "bano"
 *   2. Actualizar PropertyZone.normalizedName  "baño" → "bano"
 * -------------------------------------------------------------------
 *
 * Uso:
 *   npx tsx scripts/backfill-operational-zones.ts                   # dry-run (default)
 *   npx tsx scripts/backfill-operational-zones.ts --apply           # escribir a DB
 *   npx tsx scripts/backfill-operational-zones.ts --tenantId=X --apply
 */

import "dotenv/config";
import { PropertyZoneType } from "@prisma/client";
import prisma from "../lib/prisma";

const DRY_RUN = !process.argv.includes("--apply");
const tenantIdArg = process.argv.find((a) => a.startsWith("--tenantId="));
const TENANT_ID_FILTER = tenantIdArg?.split("=")[1];

/**
 * Mapa de sortOrder por areaNormalized verbatim.
 * Zonas virtuales (Fase 2) ocupan 100 (STORAGE) y 110 (DAMAGED).
 * Zonas operativas conocidas: 10–90.
 * Zonas operativas desconocidas (fallback): 500+.
 *
 * Notas especiales:
 * - "baño"   (50): ANOMALÍA HISTÓRICA — propiedad bcwnaouffz46zcvv97wkj5e1
 * - "bano"   (50): normalización canónica para un baño genérico sin número
 * - "bano 1" (50): Baño 1 — normalización actual
 * - "bano 2" (80): Baño 2
 */
const SORT_ORDER_MAP: Record<string, number> = {
  cochera:      10,
  sala:         20,
  comedor:      30,
  cocina:       40,
  "bano 1":     50, // Baño 1 (normalización actual, sin diacrítico)
  "bano":       50, // Baño genérico (normalización canónica)
  "baño":       50, // ANOMALÍA HISTÓRICA: areaNormalized con ñ — propiedad bcwnaouffz46zcvv97wkj5e1
  "recamara 1": 60, // Recámara 1
  "recamara 2": 70, // Recámara 2
  "bano 2":     80, // Baño 2
  lavanderia:   90, // Lavandería
};

const FALLBACK_SORT_ORDER = 500;

// Propiedad con anomalía histórica conocida — para flag en output
const ANOMALY_PROPERTY_ID = "bcwnaouffz46zcvv97wkj5e1";
const ANOMALY_NORMALIZED  = "baño";

function getSortOrder(areaNormalized: string): number {
  return SORT_ORDER_MAP[areaNormalized] ?? FALLBACK_SORT_ORDER;
}

async function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY-RUN (use --apply to write)" : "APPLY"}`);
  if (TENANT_ID_FILTER) console.log(`Tenant filter: ${TENANT_ID_FILTER}`);

  // Obtener pares distintos (propertyId, areaNormalized) con su area raw canónica.
  // La restricción @@unique en InventoryLine garantiza que cada (propertyId, areaNormalized)
  // tiene un solo valor de area raw; el distinct aquí es una salvaguarda adicional.
  const distinctAreas = await prisma.inventoryLine.findMany({
    where: {
      isActive: true,
      ...(TENANT_ID_FILTER ? { tenantId: TENANT_ID_FILTER } : {}),
    },
    select: { propertyId: true, tenantId: true, area: true, areaNormalized: true },
    distinct: ["propertyId", "areaNormalized"],
    orderBy: [{ propertyId: "asc" }, { areaNormalized: "asc" }],
  });

  // Agrupar por propiedad para resumen visual
  const byProperty = new Map<
    string,
    { tenantId: string; zones: Array<{ area: string; areaNormalized: string }> }
  >();
  for (const row of distinctAreas) {
    if (!byProperty.has(row.propertyId)) {
      byProperty.set(row.propertyId, { tenantId: row.tenantId, zones: [] });
    }
    byProperty.get(row.propertyId)!.zones.push({
      area: row.area,
      areaNormalized: row.areaNormalized,
    });
  }

  console.log(`Properties with active inventory lines: ${byProperty.size}`);
  console.log(`Total distinct (property, area) pairs  : ${distinctAreas.length}\n`);

  let totalCreated = 0;
  let totalSkipped = 0;
  let anomalyFired  = false;

  for (const [propertyId, { tenantId, zones }] of byProperty) {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { name: true },
    });
    const label = property?.name ?? propertyId;

    for (const { area, areaNormalized } of zones) {
      const isAnomaly =
        propertyId === ANOMALY_PROPERTY_ID && areaNormalized === ANOMALY_NORMALIZED;

      const existing = await prisma.propertyZone.findUnique({
        where: {
          propertyId_normalizedName: { propertyId, normalizedName: areaNormalized },
        },
        select: { id: true, zoneType: true },
      });

      if (existing) {
        if (existing.zoneType === "VIRTUAL") {
          // Nunca sobrescribir zonas virtuales
          console.warn(
            `  [WARN] ${label} → "${area}" (${areaNormalized}) — colisión con zona VIRTUAL existente, skipped`
          );
        } else {
          totalSkipped++;
          console.log(
            `  [SKIP] ${label} → "${area}" (normalizedName="${areaNormalized}") — ya existe (${existing.id})`
          );
        }
        continue;
      }

      const sortOrder  = getSortOrder(areaNormalized);
      const anomalyTag = isAnomaly
        ? " [⚠️ ANOMALÍA HISTÓRICA: normalizedName='baño' debería ser 'bano' — pendiente cleanup]"
        : "";

      totalCreated++;
      if (DRY_RUN) {
        console.log(
          `  [DRY]  ${label} → Would create "${area}" (normalizedName="${areaNormalized}", sortOrder=${sortOrder})${anomalyTag}`
        );
      } else {
        const created = await prisma.propertyZone.create({
          data: {
            tenantId,
            propertyId,
            name: area,
            normalizedName: areaNormalized, // Opción A: verbatim desde areaNormalized
            zoneType: PropertyZoneType.OPERATIONAL,
            virtualKind: null,
            sortOrder,
            isActive: true,
          },
        });
        console.log(
          `  [OK]   ${label} → Created "${area}" (${created.id}, sortOrder=${sortOrder})${anomalyTag}`
        );
        if (isAnomaly) anomalyFired = true;
      }
    }
  }

  console.log(
    `\nDone. ${DRY_RUN ? "Would create" : "Created"}: ${totalCreated} | Skipped (already exist): ${totalSkipped}`
  );

  if (!DRY_RUN && anomalyFired) {
    console.log("\n─────────────────────────────────────────────────────────────");
    console.log("⚠️  ANOMALÍA HISTÓRICA materializada — requiere cleanup futuro");
    console.log("─────────────────────────────────────────────────────────────");
    console.log(`   Propiedad ID : ${ANOMALY_PROPERTY_ID}`);
    console.log(`   área raw     : "Baño"`);
    console.log(`   normalizedName creado   : "baño"  (con ñ — verbatim, Opción A)`);
    console.log(`   normalizedName canónico : "bano"  (sin ñ — normalizeName canónica)`);
    console.log("   Acción requerida en fase cleanup:");
    console.log('     1. UPDATE InventoryLine SET areaNormalized = "bano" WHERE propertyId = ... AND areaNormalized = "baño"');
    console.log('     2. UPDATE PropertyZone SET normalizedName  = "bano" WHERE propertyId = ... AND normalizedName  = "baño"');
    console.log("─────────────────────────────────────────────────────────────");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
