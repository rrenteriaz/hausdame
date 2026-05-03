import prisma from "../lib/prisma";

async function main() {
  try {
    // 1. Buscar la propiedad CasaL
    const property = await prisma.property.findFirst({
      where: { shortName: "CasaL" },
      select: { id: true, name: true, shortName: true, tenantId: true },
    });

    if (!property) {
      console.log("CasaL no encontrada");
      return;
    }

    console.log("\n=== PROPIEDAD ===");
    console.log(`Property ID: ${property.id}`);
    console.log(`Property Name: ${property.name}`);
    console.log(`Property Short Name: ${property.shortName}`);
    console.log(`Tenant ID: ${property.tenantId}`);

    // 2. Contar zonas activas
    const zones = await prisma.propertyZone.findMany({
      where: { propertyId: property.id, isActive: true },
      select: {
        id: true,
        name: true,
        zoneType: true,
        virtualKind: true,
        isActive: true,
        _count: { select: { inventoryLines: { where: { isActive: true } } } },
      },
      orderBy: { sortOrder: "asc" },
    });

    console.log(`\n=== ZONAS ACTIVAS (${zones.length}) ===`);
    zones.forEach((zone, idx) => {
      console.log(
        `${idx + 1}. ${zone.name} (${zone.zoneType}) - ${zone._count.inventoryLines} líneas`
      );
    });

    // 3. Contar líneas de inventario
    const lines = await prisma.inventoryLine.findMany({
      where: { propertyId: property.id, isActive: true },
      select: { id: true, propertyZoneId: true },
    });

    console.log(`\n=== LÍNEAS DE INVENTARIO ACTIVAS ===`);
    console.log(`Total: ${lines.length}`);

    // 4. Zonas inactivas
    const inactiveZones = await prisma.propertyZone.findMany({
      where: { propertyId: property.id, isActive: false },
      select: { id: true, name: true, zoneType: true, createdAt: true },
    });

    if (inactiveZones.length > 0) {
      console.log(`\n=== ZONAS INACTIVAS (${inactiveZones.length}) ===`);
      inactiveZones.forEach((zone) => {
        console.log(
          `- ${zone.name} (${zone.zoneType}) - Creada: ${zone.createdAt}`
        );
      });
    }
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
