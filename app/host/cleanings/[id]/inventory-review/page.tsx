// app/host/cleanings/[id]/inventory-review/page.tsx
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { requireHostUser } from "@/lib/auth/requireUser";
import { getInventoryReview, getActiveInventoryLines } from "@/app/host/inventory-review/actions";
import InventoryReviewScreen from "./InventoryReviewScreen";

export default async function InventoryReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireHostUser();
  const tenantId = user.tenantId;
  if (!tenantId) notFound();

  const resolvedParams = await params;
  const cleaningId = resolvedParams.id;

  // Verificar que la limpieza existe
  const cleaning = await prisma.cleaning.findFirst({
    where: { id: cleaningId, tenantId },
    select: { id: true, propertyId: true, tenantId: true },
  });

  if (!cleaning || cleaning.tenantId !== tenantId) {
    notFound();
  }

  console.log(`[InventoryReviewPage] Fetching data for cleaning ${cleaningId}, property ${cleaning.propertyId}`);
  // Obtener la revisión existente (si existe) y las líneas de inventario activas
  const [review, inventoryLines] = await Promise.all([
    getInventoryReview(cleaningId),
    getActiveInventoryLines(cleaning.propertyId),
  ]);
  console.log(`[InventoryReviewPage] Review found: ${!!review}, Lines count: ${inventoryLines?.length}`);

  if (inventoryLines) {
    inventoryLines.forEach((l: any, idx: number) => {
      if (!l.item) {
        console.error(`[InventoryReviewPage] ERROR: Line at index ${idx} has NO ITEM:`, JSON.stringify(l));
      }
    });
  }

  // Permitir crear revisión incluso si no hay items (para limpiezas previas al inventario)
  // El Cleaner puede presionar "Todo en orden" para crear una revisión vacía
  return (
    <InventoryReviewScreen
      cleaningId={cleaningId}
      propertyId={cleaning.propertyId}
      initialReview={review}
      inventoryLines={(inventoryLines || []).map((line: any) => ({
        id: line.id,
        area: line.area,
        expectedQty: line.expectedQty,
        variantKey: line.variantKey,
        variantValue: line.variantValue,
        item: {
          id: line.item?.id || "",
          name: line.item?.name || "Item no encontrado",
          category: line.item?.category || "UNSPECIFIED",
        },
        allLines: line.allLines || [],
      }))}
    />
  );
}
