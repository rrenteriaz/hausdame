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
      // Fase 5: zona física como source of truth para nombre y orden
      propertyZone: {
        select: {
          id: true,
          name: true,
          normalizedName: true,
          sortOrder: true,
          zoneType: true,
        },
      },
    },
    orderBy: [
      { propertyZone: { sortOrder: "asc" } }, // Fase 5: orden por zona (fallback: area asc)
      { item: { name: "asc" } },
    ],
  });

  return lines.map((line) => {
    // Fase 5: usar propertyZone.name como fuente de verdad.
    // Fallback temporal a line.area para líneas sin zona (no debería ocurrir post-Fase 4).
    const zoneName = line.propertyZone?.name ?? line.area;
    return {
      id: line.id,
      area: zoneName, // mantiene la firma de retorno; callers siguen funcionando
      propertyZone: line.propertyZone ?? null,
      expectedQty: line.expectedQty,
      variantKey: line.variantKey,
      variantValue: line.variantValue,
      item: line.item,
      allLines: [{
        id: line.id,
        area: zoneName,
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
    };
  });
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

  // Normalizar shape de evidencias
  const normalizedReports = review.reports.map((report) => ({
    ...report,
    evidence: report.evidence.map((ev) => ({
      id: ev.id,
      assetId: ev.assetId,
      url: ev.asset.publicUrl || "",
      variant: ev.asset.variant as string | null,
    })),
  }));

  const normalizedChanges = review.itemChanges.map((change) => ({
    ...change,
    evidence: change.evidence.map((ev) => ({
      id: ev.id,
      assetId: ev.assetId,
      url: ev.asset.publicUrl || "",
      variant: ev.asset.variant as string | null,
    })),
  }));

  console.log(
    `[fetchInventoryReview] Loaded review for ${cleaningId}, reports: ${review.reports.length}, itemChanges: ${review.itemChanges.length}`
  );

  return {
    ...review,
    reports: normalizedReports,
    itemChanges: normalizedChanges,
  };
}
