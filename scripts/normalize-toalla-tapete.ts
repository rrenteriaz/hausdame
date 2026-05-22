// Normaliza "Toalla de pies" y "Toalla de piso" → "Toalla tapete" en GlobalCatalogItem
// DRY RUN por defecto. Pasar --apply para ejecutar.
import prisma from "../lib/prisma";
import { normalizeName } from "../lib/inventory-normalize";

const OLD_NAMES = ["Toalla de pies", "Toalla de piso"];
const NEW_NAME = "Toalla tapete";
const LOCALE = "es-MX";

async function run(apply: boolean) {
  console.log(`=== normalize-toalla-tapete ${apply ? "APPLY" : "DRY RUN"} ===\n`);

  const newNormalized = normalizeName(NEW_NAME);

  // Buscar los items viejos
  const oldItems = await prisma.globalCatalogItem.findMany({
    where: { locale: LOCALE, name: { in: OLD_NAMES } },
    select: { id: true, name: true, nameNormalized: true, isActive: true },
  });

  console.log(`Encontrados ${oldItems.length} items viejos:`);
  oldItems.forEach((i) => console.log(`  - "${i.name}" (${i.nameNormalized}) isActive=${i.isActive}`));

  // Buscar si ya existe "Toalla tapete"
  const existing = await prisma.globalCatalogItem.findUnique({
    where: { locale_nameNormalized: { locale: LOCALE, nameNormalized: newNormalized } },
    select: { id: true, name: true, isActive: true },
  });

  console.log(`\nExistencia de "${NEW_NAME}": ${existing ? `SÍ (id=${existing.id}, isActive=${existing.isActive})` : "NO"}`);

  if (!apply) {
    console.log("\n💡 DRY RUN: sin cambios. Pasar --apply para ejecutar.");
    return;
  }

  // Upsert "Toalla tapete"
  await prisma.globalCatalogItem.upsert({
    where: { locale_nameNormalized: { locale: LOCALE, nameNormalized: newNormalized } },
    update: { name: NEW_NAME, isActive: true, defaultCategory: "LINENS" },
    create: {
      locale: LOCALE,
      name: NEW_NAME,
      nameNormalized: newNormalized,
      defaultCategory: "LINENS",
      isActive: true,
    },
  });
  console.log(`\n✅ Upserted "${NEW_NAME}"`);

  // Desactivar los items viejos
  if (oldItems.length > 0) {
    const oldIds = oldItems.map((i) => i.id);
    await prisma.globalCatalogItem.updateMany({
      where: { id: { in: oldIds } },
      data: { isActive: false },
    });
    console.log(`✅ Desactivados ${oldIds.length} items viejos (${OLD_NAMES.join(", ")})`);
  } else {
    console.log("ℹ️  No había items viejos en DB.");
  }

  console.log("\nDone.");
}

const apply = process.argv.includes("--apply");
run(apply)
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
