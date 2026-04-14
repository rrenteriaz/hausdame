/**
 * Seed canónico de zonas virtuales por propiedad (STORAGE, DAMAGED).
 * Idempotente: upsert por @@unique([propertyId, normalizedName]).
 *
 * Uso:
 *   npx tsx scripts/seed-virtual-zones.ts                    # dry-run (default)
 *   npx tsx scripts/seed-virtual-zones.ts --apply            # escribir a DB
 *   npx tsx scripts/seed-virtual-zones.ts --tenantId=X --apply
 */

import "dotenv/config";
import { PropertyZoneType, PropertyZoneVirtualKind } from "../lib/generated/prisma";
import prisma from "../lib/prisma";

const DRY_RUN = !process.argv.includes("--apply");
const tenantIdArg = process.argv.find((a) => a.startsWith("--tenantId="));
const TENANT_ID_FILTER = tenantIdArg?.split("=")[1];

// Normalización idéntica a lib/inventory-normalize.ts → normalizeName
function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

const VIRTUAL_ZONES: Array<{
  name: string;
  normalizedName: string;
  virtualKind: PropertyZoneVirtualKind;
  sortOrder: number;
}> = [
  {
    name: "Almacén",
    normalizedName: normalizeName("Almacén"),      // → "almacen"
    virtualKind: PropertyZoneVirtualKind.STORAGE,
    sortOrder: 100,
  },
  {
    name: "Dañados / Baja",
    normalizedName: normalizeName("Dañados / Baja"), // → "danados / baja"
    virtualKind: PropertyZoneVirtualKind.DAMAGED,
    sortOrder: 110,
  },
];

async function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY-RUN (use --apply to write)" : "APPLY"}`);
  if (TENANT_ID_FILTER) {
    console.log(`Tenant filter: ${TENANT_ID_FILTER}`);
  }

  const properties = await prisma.property.findMany({
    where: {
      isActive: true,
      ...(TENANT_ID_FILTER ? { tenantId: TENANT_ID_FILTER } : {}),
    },
    select: { id: true, tenantId: true, name: true },
    orderBy: [{ tenantId: "asc" }, { name: "asc" }],
  });

  console.log(`Properties found: ${properties.length}`);

  let totalCreated = 0;
  let totalSkipped = 0;

  for (const property of properties) {
    for (const zone of VIRTUAL_ZONES) {
      const existing = await prisma.propertyZone.findUnique({
        where: {
          propertyId_normalizedName: {
            propertyId: property.id,
            normalizedName: zone.normalizedName,
          },
        },
      });

      if (existing) {
        totalSkipped++;
        if (DRY_RUN) {
          console.log(
            `  [SKIP] ${property.name} → "${zone.name}" (ya existe: ${existing.id})`
          );
        }
        continue;
      }

      totalCreated++;
      if (DRY_RUN) {
        console.log(
          `  [DRY]  ${property.name} → Would create "${zone.name}" (${zone.virtualKind}, sortOrder=${zone.sortOrder})`
        );
      } else {
        const created = await prisma.propertyZone.create({
          data: {
            tenantId: property.tenantId,
            propertyId: property.id,
            name: zone.name,
            normalizedName: zone.normalizedName,
            zoneType: PropertyZoneType.VIRTUAL,
            virtualKind: zone.virtualKind,
            sortOrder: zone.sortOrder,
            isActive: true,
          },
        });
        console.log(
          `  [OK]   ${property.name} → Created "${zone.name}" (${created.id})`
        );
      }
    }
  }

  console.log(
    `\nDone. ${DRY_RUN ? "Would create" : "Created"}: ${totalCreated} | Skipped (already exist): ${totalSkipped}`
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
