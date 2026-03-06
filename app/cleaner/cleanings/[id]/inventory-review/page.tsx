// app/cleaner/cleanings/[id]/inventory-review/page.tsx
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { getDefaultTenant } from "@/lib/tenant";
import { fetchInventoryReview, fetchActiveInventoryLines } from "@/lib/inventory-review-queries";
import { validateRedirect } from "@/lib/auth/validateRedirect";
import InventoryReviewPanel from "./InventoryReviewPanel";

export default async function CleanerInventoryReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ memberId?: string; returnTo?: string }>;
}) {
  const tenant = await getDefaultTenant();
  if (!tenant) notFound();

  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const cleaningId = resolvedParams.id;
  const defaultReturn = `/cleaner/cleanings/${cleaningId}`;
  const returnTo =
    validateRedirect(resolvedSearchParams.returnTo, ["/cleaner"]) ?? defaultReturn;

  // Verificar que la limpieza existe
  const cleaning = await prisma.cleaning.findUnique({
    where: { id: cleaningId },
    select: { id: true, propertyId: true, tenantId: true },
  });

  if (!cleaning || cleaning.tenantId !== tenant.id) {
    notFound();
  }

  // Obtener la revisión existente (si existe) y las líneas de inventario activas
  // Usar lib compartida (no host actions) para evitar redirect: requireHostUser redirige CLEANER a /cleaner
  const [review, inventoryLines] = await Promise.all([
    fetchInventoryReview(cleaningId, cleaning.tenantId),
    fetchActiveInventoryLines(cleaning.propertyId, cleaning.tenantId),
  ]);

  return (
    <InventoryReviewPanel
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
      returnTo={returnTo}
      mode="page"
    />
  );
}

