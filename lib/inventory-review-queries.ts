/**
 * Consultas de inventario/review compartidas.
 * NO hacen auth: quien llama debe haber verificado acceso al tenantId.
 * Usado por host (después de requireHostUser) y cleaner (después de checkCleaningPropertyAccess).
 */
import prisma from "@/lib/prisma";

/**
 * Obtiene las líneas de inventario activas de una propiedad para la revisión.
 * Requiere que el caller ya haya verificado acceso al tenantId.
 */
export async function fetchActiveInventoryLines(propertyId: string, tenantId: string) {
  if (!tenantId) return [];

  console.log(`[fetchActiveInventoryLines] Starting query for property ${propertyId}`);
  const lines = await prisma.inventoryLine.findMany({
    where: {
      tenantId,
      propertyId,
      isActive: true,
    },
    select: {
      id: true,
      area: true,
      expectedQty: true,
      variantKey: true,
      variantValue: true,
      brand: true,
      model: true,
      color: true,
      size: true,
      condition: true,
      priority: true,
      notes: true,
      item: {
        select: {
          id: true,
          name: true,
          category: true,
        },
      },
    },
    orderBy: [
      { item: { name: "asc" } },
      { area: "asc" },
    ],
  });

  return lines.map((line) => ({
    id: line.id,
    area: line.area,
    expectedQty: line.expectedQty,
    variantKey: line.variantKey,
    variantValue: line.variantValue,
    item: line.item,
    allLines: [{
      id: line.id,
      area: line.area,
      expectedQty: line.expectedQty,
      variantKey: line.variantKey,
      variantValue: line.variantValue,
      brand: line.brand,
      model: line.model,
      color: line.color,
      size: line.size,
      condition: line.condition,
      priority: line.priority,
      notes: line.notes,
    }],
  }));
}

/**
 * Obtiene una revisión de inventario con todos sus datos.
 * Requiere que el caller ya haya verificado acceso al tenantId.
 */
export async function fetchInventoryReview(cleaningId: string, tenantId: string) {
  if (!tenantId) return null;

  const review = await prisma.inventoryReview.findFirst({
    where: { cleaningId, tenantId },
    include: {
      itemChanges: {
        include: {
          item: {
            select: {
              id: true,
              name: true,
              category: true,
            },
          },
          evidence: {
            include: {
              asset: {
                select: {
                  id: true,
                  publicUrl: true,
                  variant: true,
                },
              },
            },
          },
        },
      },
      reports: {
        include: {
          item: {
            select: {
              id: true,
              name: true,
              category: true,
            },
          },
          evidence: {
            include: {
              asset: {
                select: {
                  id: true,
                  publicUrl: true,
                  variant: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!review || review.tenantId !== tenantId) {
    return null;
  }

  console.log(`[fetchInventoryReview] Loaded review for ${cleaningId}, reports: ${review.reports.length}, itemChanges: ${review.itemChanges.length}`);
  return review;
}
